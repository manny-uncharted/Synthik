import os
import httpx
import json
import logging
import requests
import uuid
from redis.asyncio import Redis as AsyncRedis
from typing import List, Dict, Any, Optional, Union

from fastapi import FastAPI, HTTPException, Depends, APIRouter, Body, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session # Assuming you'll integrate SQLAlchemy session for some operations

from app.core.database import get_session
from app.ai_agents.schemas import (
    WorkflowDefinitionResponse,
)
from app.ai_agents.models import WorkflowDefinitionDB
from app.core.redis import get_redis_pool, get_redis_connection
from app.core.constants import DATASET_VERIFIER_WORKFLOW_ID, DATASET_VERIFIER_WORKFLOW_NAME_TEMPLATE

try:
    from app.ai_agents.enterprise_workflow import (
        EnterpriseWorkflowManager,
        AppConfig as WFAppConfig,
        ToolRegistry as WFToolRegistry,
        BaseTool as WFBaseTool,
        tool as wf_tool,
        WorkflowDefinition as WFWorkflowDefinition,
        AgentConfigData as WFAgentConfigData,
        WorkflowNodeData as WFWorkflowNodeData,
        WorkflowEdgeData as WFWorkflowEdgeData
    )
except ImportError as e:
    logging.error(f"Failed to import from enterprise_workflow.py: {e}. Ensure the file exists and is in PYTHONPATH.")
    # Define placeholders if import fails, to allow FastAPI app to load (with limited functionality)
    class WFBaseTool: pass
    def wf_tool(func): return func
    WFWorkflowDefinition = Dict 
    WFAgentConfigData = Dict
    WFWorkflowNodeData = Dict
    WFWorkflowEdgeData = Dict
    class EnterpriseWorkflowManager: 
        def __init__(self, *args, **kwargs): raise NotImplementedError("Workflow system not loaded")
        def run_workflow(self, *args, **kwargs): raise NotImplementedError("Workflow system not loaded")
    class WFAppConfig: 
        FASTAPI_BASE_URL = None # Placeholder
        

# --- Logging ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger("MultiAgentAPI")



WORKFLOW_DEFINITIONS_STORE: Dict[str, WFWorkflowDefinition] = {}
# Initialize workflow app config
WF_CONFIG = WFAppConfig()




class CampaignDataTool(WFBaseTool):
    name: str = "campaign_data_query"
    description: str = (
        "Queries the campaign data platform for information about campaigns or contributions. "
        "Use this to fetch details like campaign requirements, contribution data URLs, etc. "
        "Input should be a JSON object with 'query_type' (e.g., 'get_campaign_details', 'get_contribution_data'), "
        "and 'params' (a dictionary of parameters like 'onchain_campaign_id' or 'contribution_id')."
    )
    fastapi_base_url: Optional[str]

    def __init__(self, fastapi_base_url: Optional[str] = None, **kwargs):
        super().__init__(**kwargs) # Pass kwargs to BaseTool
        self.fastapi_base_url = fastapi_base_url
        if not self.fastapi_base_url:
            logger.warning("FastAPI base_url not provided to CampaignDataTool.")
        if not requests: # Check if requests library is available
            logger.error("'requests' library is not installed. CampaignDataTool will not function.")

    def _run(self, query_type: str, params: Dict[str, Any]) -> str:
        if not requests: return json.dumps({"error": "'requests' library not installed."})
        if not self.fastapi_base_url: return json.dumps({"error": "FastAPI base_url for campaign data not configured."})
        logger.info(f"CampaignDataTool: query_type='{query_type}', params={params}")
        # ... (implementation from previous version) ...
        if query_type == "get_campaign_details_by_onchain_id":
            onchain_id = params.get("onchain_campaign_id")
            if not onchain_id: return json.dumps({"error": "Missing 'onchain_campaign_id'."})
            endpoint = f"{self.fastapi_base_url}/campaigns/{onchain_id}"
        elif query_type == "get_campaign_contributions":
            onchain_id = params.get("onchain_campaign_id")
            if not onchain_id: return json.dumps({"error": "Missing 'onchain_campaign_id'."})
            endpoint = f"{self.fastapi_base_url}/campaigns/get-contributions/{onchain_id}"
        else:
            return json.dumps({"error": f"Unsupported query_type: {query_type}"})
        try:
            response = requests.get(endpoint, timeout=10)
            response.raise_for_status(); return json.dumps(response.json())
        except Exception as e:
            logger.error(f"CampaignDataTool API call to {endpoint} failed: {e}"); return json.dumps({"error": str(e)})
    async def _arun(self, query_type: str, params: Dict[str, Any]) -> str: return self._run(query_type, params)

    async def _arun(self, query_type: str, params: Dict[str, Any]) -> str:
        # TODO: Use httpx for async requests in a real scenario
        logger.warning("CampaignDataTool._arun is using synchronous requests.")
        return self._run(query_type, params)


class UpdateContributionVerificationTool(WFBaseTool):
    name: str = "update_contribution_verification"
    description: str = "Updates AI verification status of a contribution."
    fastapi_base_url: Optional[str]
    def __init__(self, fastapi_base_url: Optional[str] = None, **kwargs):
        super().__init__(**kwargs)
        self.fastapi_base_url = fastapi_base_url
        if not self.fastapi_base_url: logger.warning("FastAPI base_url not provided to UpdateContributionVerificationTool.")
        if not requests: logger.error("'requests' library not installed.")
    def _run(self, contribution_id: str, ai_verification_score: float, is_verified: bool) -> str:
        if not requests: return json.dumps({"error": "'requests' library not installed."})
        if not self.fastapi_base_url: return json.dumps({"error": "FastAPI base_url not configured."})
        endpoint = f"{self.fastapi_base_url}/internal/contributions/{contribution_id}/verify" # Assumed internal endpoint
        payload = {"ai_verification_score": ai_verification_score, "is_verified": is_verified}
        logger.info(f"UpdateContributionVerificationTool: Calling {endpoint} with {payload}")
        # Actual call commented out, implement this endpoint in your campaign API
        logger.warning(f"UpdateContributionVerificationTool: Call to {endpoint} is mocked."); 
        return json.dumps({"status": "success", "message": "Verification update mocked.", "contribution_id": contribution_id})
    async def _arun(self, contribution_id: str, ai_verification_score: float, is_verified: bool) -> str: return self._run(contribution_id, ai_verification_score, is_verified)



async def get_workflow_def_from_cache_or_db(workflow_id_api: str, db: Session, redis: AsyncRedis) -> Optional[WorkflowDefinitionResponse]:
    cache_key = f"workflow_define:{workflow_id_api}"
    cached_def_bytes = await redis.get(cache_key)
    if cached_def_bytes:
        logger.info(f"Cache HIT for workflow definition: {workflow_id_api}")
        cached_def_str = cached_def_bytes.decode('utf-8')
        cached_def = json.loads(cached_def_str)
        return WorkflowDefinitionResponse(
            workflow_id_api=cached_def['workflow_id_api'],
            name=cached_def['name'],
            wallet_address=cached_def['wallet_address'],
            definition_payload=WFWorkflowDefinition(**cached_def['definition']),
            created_at=cached_def['created_at'],
            updated_at=cached_def.get('updated_at')
        )

    logger.info(f"Cache MISS for workflow definition: {workflow_id_api}. Fetching from DB.")
    db_workflow = db.query(WorkflowDefinitionDB).filter(WorkflowDefinitionDB.workflow_id_api == workflow_id_api).first()
    if db_workflow:
        # Store the dictionary representation in cache
        data = {
            "workflow_id_api": db_workflow.workflow_id_api,
            "name": db_workflow.name,
            "wallet_address": db_workflow.wallet_address,
            "definition": db_workflow.definition,
            "created_at": str(db_workflow.created_at),
            "updated_at": str(db_workflow.updated_at) if db_workflow.updated_at else None
        }
        print(f"Workflow definition from data: {data}")
        await redis.set(cache_key, json.dumps(data), ex=3600)
        return WorkflowDefinitionResponse(
            workflow_id_api=data['workflow_id_api'],
            name=data['name'],
            wallet_address=data['wallet_address'],
            definition_payload=WFWorkflowDefinition(**data['definition']),
            created_at=data['created_at'],
            updated_at=data['updated_at']
        )
    return None

async def cache_workflow_def(workflow_id_api: str, workflow_def: WFWorkflowDefinition, redis: AsyncRedis):
    cache_key = f"workflow_define:{workflow_id_api}"
    await redis.set(cache_key, json.dumps(workflow_def), ex=3600)

async def invalidate_workflow_def_cache(workflow_id_api: str, redis: AsyncRedis):
    cache_key = f"workflow_define:{workflow_id_api}"
    await redis.delete(cache_key)


def get_workflow_manager_instance(workflow_definition: WFWorkflowDefinition) -> EnterpriseWorkflowManager:
    """Instantiates EWM. Tool registry is handled within EWM based on app_config."""
    return EnterpriseWorkflowManager(
        workflow_definition=workflow_definition,
        app_config=WF_CONFIG,
        persistence_db=":memory:" # LangGraph checkpointer, not workflow def storage
    )


def get_workflow_manager(workflow_definition: WFWorkflowDefinition) -> EnterpriseWorkflowManager:
    """Helper to instantiate workflow manager with dynamically added campaign tools."""
    # Create a new ToolRegistry instance for this manager
    # This ensures that if tools are modified (e.g. new FastAPI base URL), new managers get updated tools.
    current_tool_registry = WFToolRegistry(app_config=WF_CONFIG) # WF_CONFIG has FASTAPI_BASE_URL

    # Add campaign specific tools if not already present or if they need specific config for this workflow
    # For simplicity, we assume WF_CONFIG.FASTAPI_BASE_URL is set globally for tools.
    # If a workflow definition specified its own data source URLs, those would be passed here.
    if not current_tool_registry.get_tool(CampaignDataTool.name): # type: ignore
        current_tool_registry.add_tool(CampaignDataTool(fastapi_base_url=WF_CONFIG.FASTAPI_BASE_URL))
    if not current_tool_registry.get_tool(UpdateContributionVerificationTool.name): # type: ignore
        current_tool_registry.add_tool(UpdateContributionVerificationTool(fastapi_base_url=WF_CONFIG.FASTAPI_BASE_URL))
    
    # The EnterpriseWorkflowManager in enterprise_workflow.py needs to be able
    # to accept a pre-configured tool_registry or configure it internally.
    # Let's assume it takes app_config and sets up its ToolRegistry.
    # If it needs to be more dynamic, its __init__ would accept a tool_registry instance.
    # For now, the existing EWM creates its own ToolRegistry using the passed app_config.

    return EnterpriseWorkflowManager(
        workflow_definition=workflow_definition,
        app_config=WF_CONFIG, # Pass the global WF_CONFIG
        persistence_db=":memory:" # For demo. Use persistent DB for enterprise.
    )


async def get_or_create_dataset_verifier_workflow_def(db: Session, redis: AsyncRedis) -> WFWorkflowDefinition:
    # Check if a system-default verifier workflow exists by a known name or API ID
    # For simplicity, we use a fixed name. In production, this might have a specific flag or tag.
    api_id_candidate = DATASET_VERIFIER_WORKFLOW_NAME_TEMPLATE.lower().replace(" ", "_") # simplified ID generation
    
    existing_def = await get_workflow_def_from_cache_or_db(api_id_candidate, db, redis)
    if existing_def:
        return existing_def

    logger.info(f"Default dataset verifier workflow not found or not cached. Defining '{DATASET_VERIFIER_WORKFLOW_NAME_TEMPLATE}'.")
    verifier_workflow_payload: WFWorkflowDefinition = { # This is the WFWorkflowDefinition TypedDict
        "name": DATASET_VERIFIER_WORKFLOW_NAME_TEMPLATE,
        "agent_configs": [
             {
                "name": "ContributionDataFetcherAgent",
                "system_message_template": (
                    "You are a Data Fetcher Agent ({agent_name}). Your task is to retrieve data for a specific campaign contribution "
                    "using the 'campaign_data_query' tool. Input provides 'contribution_id', 'onchain_campaign_id', 'data_url_input'. "
                    "First, use query_type='get_campaign_contributions' with onchain_campaign_id to find the specific contribution if only onchain_id is known. "
                    "Then, if you have the contribution_id, use query_type='get_contribution_details' with contribution_id to get its data_url. "
                    "If data_url_input is directly provided, use that. "
                    "Once you have the data_url, fetch its content (e.g., using 'web_search' if it's a public URL). "
                    "Pass the 'contribution_id' and the fetched data content to the VerificationAgent."
                ),
                "llm_choice": "google",
                "allowed_tools": [CampaignDataTool.name, "web_search"]
            },
            {
                "name": "DatasetQualityVerifierAgent",
                "system_message_template": (
                    "You are a Dataset Quality Verifier Agent ({agent_name}). You received data content and 'contribution_id'. "
                    "Analyze the data based on quality criteria (clarity, relevance, format). "
                    "Provide 'ai_verification_score' (0.0-1.0) and 'is_verified' (bool). "
                    "Use 'update_contribution_verification' tool to record findings for the 'contribution_id'."
                ),
                "llm_choice": "google",
                "allowed_tools": [UpdateContributionVerificationTool.name]
            }
        ],
        "nodes": [
            {"id": "fetch_contribution_data_step", "agent_config_name": "ContributionDataFetcherAgent"},
            {"id": "verify_quality_step", "agent_config_name": "DatasetQualityVerifierAgent"}
        ],
        "edges": [
            {"source_node_id": "fetch_contribution_data_step", "target_node_id": "tool_executor", "condition": "ON_TOOL_CALL"},
            {"source_node_id": "fetch_contribution_data_step", "target_node_id": "verify_quality_step", "condition": "ON_NO_TOOL_CALL"},
            {"source_node_id": "verify_quality_step", "target_node_id": "tool_executor", "condition": "ON_TOOL_CALL"},
            {"source_node_id": "verify_quality_step", "target_node_id": "END", "condition": "ON_NO_TOOL_CALL"},
        ],
        "start_node_id": "fetch_contribution_data_step"
    }
    # Save this default verifier workflow to DB and cache it
    db_workflow = WorkflowDefinitionDB(
        workflow_id_api=api_id_candidate, # Use the generated candidate ID
        name=DATASET_VERIFIER_WORKFLOW_NAME_TEMPLATE,
        wallet_address="system_default", # Indicates it's a system workflow
        definition=verifier_workflow_payload
    )
    db.add(db_workflow)
    try:
        db.commit(); db.refresh(db_workflow)
        await cache_workflow_def(api_id_candidate, verifier_workflow_payload, redis)
        logger.info(f"Created and cached system default verifier workflow: API_ID='{api_id_candidate}'")
        return verifier_workflow_payload
    except Exception as e: # Could be unique constraint violation if another process created it
        db.rollback()
        logger.warning(f"Failed to save default verifier workflow, might exist: {e}. Attempting to fetch again.")
        # Try fetching again in case of race condition
        refetched_def = await get_workflow_def_from_cache_or_db(api_id_candidate, db, redis)
        if refetched_def: return refetched_def
        raise HTTPException(status_code=500, detail="Could not create or retrieve default verifier workflow.")