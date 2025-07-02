import os
import httpx
import json
import logging
import requests
import uuid
# import aioredis
import redis.asyncio as aioredis
from typing import List, Dict, Any, Optional, Union

from fastapi import FastAPI, HTTPException, Depends, APIRouter, Body, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session # Assuming you'll integrate SQLAlchemy session for some operations

from app.core.database import get_session
from app.ai_agents.schemas import (
    WorkflowCreateRequest,
    WorkflowRunDetailRequest,
    WorkflowCreateResponse,
    WorkflowDefinitionIn,
    WorkflowDefinitionResponse,
    WorkflowRunResponse,
    ContributionVerificationRequest,
    CampaignVerificationRequest,
    AvailableLLMsResponse,
)
from app.ai_agents.services import (
    WF_CONFIG,
    WORKFLOW_DEFINITIONS_STORE,
    get_workflow_def_from_cache_or_db,
    cache_workflow_def,
    get_or_create_dataset_verifier_workflow_def,
    invalidate_workflow_def_cache,
    get_workflow_manager_instance,
)
from app.ai_agents.models import WorkflowDefinitionDB
from app.core.redis import get_redis_pool, get_redis_connection


try:
    from app.ai_agents.enterprise_workflow import (
        AppConfig as WFAppConfig,
        tool as wf_tool,
        WorkflowDefinition as WFWorkflowDefinition,
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
        

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger("MultiAgentAPI")


multi_agent_router = APIRouter(prefix="/agent-workflows", tags=["Multi-Agent Workflows"])


@multi_agent_router.get("/llms", response_model=AvailableLLMsResponse)
async def get_available_llms():
    available_llms = [
        WFAppConfig.DEFAULT_ATOMA_MODEL,
        WFAppConfig.ATOMA_ALT_MODEL_1,
        WFAppConfig.ATOMA_ALT_MODEL_2,
        WFAppConfig.DEFAULT_GOOGLE_MODEL,
    ]
    return AvailableLLMsResponse(llms=available_llms)


@multi_agent_router.post(
    "/define", 
    response_model=WorkflowDefinitionResponse, 
    status_code=201,
    description="""
        Define a new multi-agent workflow. This endpoint allows you to create a custom sequence of AI agents that work together to achieve a specific goal.

        **Understanding the Workflow Definition:**

        Think of a workflow as a simple story with characters (agents) who perform tasks (nodes) in a specific order (edges) based on what happens.

        **Key Parts of the 'definition_payload':**

        - **name**: A name for your workflow (like 'Research and Summarize').
        - **agent_configs**: Describes each AI 'character' in your workflow:
            - **name**: A unique name for this AI (like 'WebResearcher').
            - **system_message_template**: The initial instructions you give to this AI (like 'You are a helpful researcher...'). Can include placeholders like '{agent_name}'.
            - **llm_choice**: Which brain this AI will use (see the /llms endpoint for choices like 'google' or 'atoma').
            - **allowed_tools**: What special tools this AI can use (like 'web_search').
        - **nodes**: The different 'tasks' or 'steps' in your workflow:
            - **id**: A unique name for this step (like 'first_search').
            - **agent_config_name**: Which AI from 'agent_configs' will do this step (e.g., 'WebResearcher').
        - **edges**: How the workflow moves from one step to another:
            - **source_node_id**: The 'id' of the step where it's coming from.
            - **target_node_id**: The next step, or 'END' if the workflow finishes here.
            - **condition**: What makes it move to the next step (e.g., 'ALWAYS' means it always goes to the next step, 'ON_TOOL_CALL' means it goes to the next step if the AI used a tool).
        - **start_node_id**: The 'id' of the very first step in your workflow.

        **Example 'definition_payload':**

        ```json
        {
          "name": "Simple Research Workflow",
          "agent_configs": [
            {
              "name": "Researcher",
              "system_message_template": "You are a researcher. Find information about {topic}.",
              "llm_choice": "google",
              "allowed_tools": ["web_search"]
            },
            {
              "name": "Summarizer",
              "system_message_template": "You are a summarizer. Summarize the information you receive.",
              "llm_choice": "google",
              "allowed_tools": []
            }
          ],
          "nodes": [
            {
              "id": "research_step",
              "agent_config_name": "Researcher"
            },
            {
              "id": "summary_step",
              "agent_config_name": "Summarizer"
            }
          ],
          "edges": [
            {
              "source_node_id": "research_step",
              "target_node_id": "summary_step",
              "condition": "ALWAYS"
            },
            {
              "source_node_id": "summary_step",
              "target_node_id": "END",
              "condition": "ALWAYS"
            }
          ],
          "start_node_id": "research_step"
        }
        ```
    """
)
async def define_workflow(
    payload: WorkflowDefinitionIn,
    db: Session = Depends(get_session),
    redis: aioredis.Redis = Depends(get_redis_connection)
):
    # Generate a unique API-facing ID for the workflow
    # This could also be derived from payload.name if desired, ensuring uniqueness
    workflow_id_api = f"{payload.name.lower().replace(' ', '_')}_{str(uuid.uuid4())[:8]}"
    
    existing_workflow_by_api_id = db.query(WorkflowDefinitionDB).filter(WorkflowDefinitionDB.workflow_id_api == workflow_id_api).first()
    logger.info("Existing workflow by API ID: {}", existing_workflow_by_api_id)
    if existing_workflow_by_api_id:
        logger.error(f"Generated workflow_id_api '{workflow_id_api}' already exists. Try a different name or it's a hash collision.")
        raise HTTPException(status_code=409, detail=f"Generated workflow_id_api '{workflow_id_api}' already exists. Try a different name or it's a hash collision.")

    # Basic validation of the definition structure (can be more sophisticated)
    if not all(k in payload.definition_payload.model_dump() for k in ["name", "agent_configs", "nodes", "edges", "start_node_id"]):
        logger.error("Invalid workflow definition payload. Missing required fields.")
        raise HTTPException(status_code=400, detail="Invalid workflow definition payload. Missing required fields.")
    if payload.definition_payload.model_dump()["name"] != payload.name:
        logger.warning("Mismatch between payload.name and definition_payload.name. Using payload.name for DB.")
        payload.definition_payload.model_dump()["name"] = payload.name # Ensure consistency

    db_workflow = WorkflowDefinitionDB(
        workflow_id_api=workflow_id_api,
        name=payload.name,
        wallet_address=payload.wallet_address,
        definition=payload.definition_payload.model_dump()
    )
    db.add(db_workflow)
    try:
        db.commit()
        db.refresh(db_workflow)
        await cache_workflow_def(workflow_id_api, db_workflow.definition, redis)
        logger.info(f"Defined and cached new workflow: ID='{db_workflow.id}', API_ID='{workflow_id_api}' by wallet '{payload.wallet_address}'")
        
        # Construct response manually to ensure definition_payload is included correctly
        return WorkflowDefinitionResponse(
            workflow_id_api=db_workflow.workflow_id_api,
            name=db_workflow.name,
            wallet_address=db_workflow.wallet_address,
            definition_payload=payload.definition_payload.model_dump(),
            created_at=db_workflow.created_at,
            updated_at=db_workflow.updated_at
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Error defining workflow: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not save workflow definition: {str(e)}")


@multi_agent_router.get("/{workflow_id_api}", response_model=WorkflowDefinitionResponse)
async def get_workflow_definition(
    workflow_id_api: str,
    db: Session = Depends(get_session),
    redis: aioredis.Redis = Depends(get_redis_connection)
):
    workflow_def_db = await get_workflow_def_from_cache_or_db(
        workflow_id_api=workflow_id_api,
        db=db,
        redis=redis
    )
    logger.info(f"Workflow definition from cache or DB: {workflow_def_db}")
    if not workflow_def_db:
        raise HTTPException(status_code=404, detail=f"Workflow with API ID '{workflow_id_api}' not found.")
    
    if isinstance(workflow_def_db, dict):
        logger.info("Workflow definition is a dictionary")
        logger.info("Workflow definition: {}", workflow_def_db)
        return WorkflowDefinitionResponse(
            workflow_id_api=workflow_def_db.get("workflow_id_api"),
            name=workflow_def_db.get("name"),
            wallet_address=workflow_def_db.get("wallet_address"),
            definition_payload=workflow_def_db.get("definition"),
            created_at=workflow_def_db.get("created_at"),
            updated_at=workflow_def_db.get("updated_at"),
        )
    else:
        logger.info("Workflow definition is a WorkflowDefinitionDB object")
        return WorkflowDefinitionResponse(
            workflow_id_api=workflow_def_db.workflow_id_api,
            name=workflow_def_db.name,
            wallet_address=workflow_def_db.wallet_address,
            definition_payload=workflow_def_db.definition,
            created_at=workflow_def_db.created_at,
            updated_at=workflow_def_db.updated_at,
        )


@multi_agent_router.get("/by-wallet/{wallet_address}", response_model=List[WorkflowDefinitionResponse])
async def get_workflows_by_wallet(
    wallet_address: str,
    db: Session = Depends(get_session)
):
    workflows = db.query(WorkflowDefinitionDB).filter(WorkflowDefinitionDB.wallet_address == wallet_address).order_by(WorkflowDefinitionDB.created_at.desc()).all()
    if not workflows:
        logger.info(f"No workflows found for wallet: {wallet_address}")
        return []
    return [WorkflowDefinitionResponse.from_orm(wf) for wf in workflows]

@multi_agent_router.put("/{workflow_id_api}", response_model=WorkflowDefinitionResponse)
async def update_workflow_definition(
    workflow_id_api: str,
    payload: WorkflowDefinitionIn, # Reuses the create schema
    db: Session = Depends(get_session),
    redis: aioredis.Redis = Depends(get_redis_connection)
):
    db_workflow = db.query(WorkflowDefinitionDB).filter(WorkflowDefinitionDB.workflow_id_api == workflow_id_api).first()
    logger.info("Fetching workflow with details: {}", db_workflow)
    if not db_workflow:
        logger.error(f"Workflow with API ID '{workflow_id_api}' not found.")
        raise HTTPException(status_code=404, detail=f"Workflow with API ID '{workflow_id_api}' not found.")

    # Update fields
    db_workflow.name = payload.name
    db_workflow.wallet_address = payload.wallet_address # Or disallow changing owner
    db_workflow.definition = payload.definition_payload.model_dump()
    # updated_at is handled by onupdate

    try:
        db.commit()
        db.refresh(db_workflow)
        await cache_workflow_def(workflow_id_api, db_workflow.definition, redis) # Re-cache
        logger.info(f"Updated and re-cached workflow: API_ID='{workflow_id_api}'")
        return WorkflowDefinitionResponse.from_orm(db_workflow)
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating workflow {workflow_id_api}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not update workflow: {str(e)}")


@multi_agent_router.delete("/{workflow_id_api}", status_code=204)
async def delete_workflow_definition(
    workflow_id_api: str,
    db: Session = Depends(get_session),
    redis: aioredis.Redis = Depends(get_redis_connection)
):
    db_workflow = db.query(WorkflowDefinitionDB).filter(WorkflowDefinitionDB.workflow_id_api == workflow_id_api).first()
    if not db_workflow:
        raise HTTPException(status_code=404, detail=f"Workflow with API ID '{workflow_id_api}' not found.")
    
    try:
        db.delete(db_workflow)
        db.commit()
        await invalidate_workflow_def_cache(workflow_id_api, redis)
        logger.info(f"Deleted workflow: API_ID='{workflow_id_api}'")
        return
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting workflow {workflow_id_api}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not delete workflow: {str(e)}")


@multi_agent_router.post("/run/{workflow_id_api}", response_model=WorkflowRunResponse)
async def run_workflow_by_id(
    workflow_id_api: str,
    run_request: WorkflowRunDetailRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_session),
    redis: aioredis.Redis = Depends(get_redis_connection)
):
    workflow_def_payload = await get_workflow_def_from_cache_or_db(workflow_id_api, db, redis)
    logger.info(f"Workflow definition from cache or DB: {workflow_def_payload}")
    if not workflow_def_payload:
        raise HTTPException(status_code=404, detail=f"Workflow with API ID '{workflow_id_api}' not found.")

    logger.info(f"Running workflow API_ID='{workflow_id_api}', Name='{workflow_def_payload.name}' with task: {run_request.task_description}")

    try:
        manager = get_workflow_manager_instance(workflow_def_payload)
        logger.info(f"Workflow manager created for API_ID='{workflow_id_api}, manager={manager}'")
        initial_input = {
            "task_description": run_request.task_description,
            "initial_scratchpad": run_request.initial_scratchpad
        }
        thread_id = run_request.thread_id or str(uuid.uuid4())
        logger.info(f"Thread ID: {thread_id}")

        # For actual background execution:
        # background_tasks.add_task(manager.run_workflow, initial_input, thread_id)
        # return WorkflowRunResponse(thread_id=thread_id, status="PENDING", message="Workflow started in background.")
        
        # Synchronous execution for this example:
        final_state = manager.run_workflow(initial_input, thread_id=thread_id)
        logger.info(f"Workflow run completed for API_ID='{workflow_id_api}', thread_id='{thread_id}', final_state={final_state}")
        
        return WorkflowRunResponse(
            thread_id=thread_id,
            status="COMPLETED" if "error" not in final_state else "ERROR",
            final_state=final_state,
            message=final_state.get("error")
        )
    except Exception as e:
        logger.error(f"Error running workflow '{workflow_id_api}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to run workflow: {str(e)}")



# @multi_agent_router.post("/verify-contribution", response_model=WorkflowRunResponse)
# async def verify_dataset_contribution(
#     request: ContributionVerificationRequest,
#     background_tasks: BackgroundTasks,
#     db: Session = Depends(get_session),
#     redis: aioredis.Redis = Depends(get_redis_connection)
# ):
#     verifier_workflow_def = await get_or_create_dataset_verifier_workflow_def(db, redis)
#     task_description = (
#         f"Verify contribution with ID '{request.contribution_id}'. "
#         f"Associated onchain_campaign_id is '{request.onchain_campaign_id}', data_url provided is '{request.data_url}'. "
#         "Fetch data and verify quality."
#     )
#     initial_scratchpad = {
#         "contribution_id": request.contribution_id,
#         "onchain_campaign_id": request.onchain_campaign_id,
#         "data_url_input": request.data_url
#     }
#     logger.info(f"Starting verification for contribution_id='{request.contribution_id}' using workflow '{verifier_workflow_def['name']}'")
#     try:
#         manager = get_workflow_manager_instance(verifier_workflow_def)
#         initial_input = {"task_description": task_description, "initial_scratchpad": initial_scratchpad}
#         thread_id = f"verify_contrib_{request.contribution_id}_{str(uuid.uuid4())[:8]}"
#         final_state = manager.run_workflow(initial_input, thread_id=thread_id) # Synchronous for now
#         return WorkflowRunResponse(
#             thread_id=thread_id,
#             status="COMPLETED" if "error" not in final_state else "ERROR",
#             final_state=final_state,
#             message=f"Verification for {request.contribution_id} finished."
#         )
#     except Exception as e:
#         logger.error(f"Error running verification for {request.contribution_id}: {e}", exc_info=True)
#         raise HTTPException(status_code=500, detail=f"Verification workflow failed: {str(e)}")


@multi_agent_router.post("/verify-campaign-dataset", response_model=Dict[str, Any])
async def verify_campaign_dataset(
    request: CampaignVerificationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_session),
    redis: aioredis.Redis = Depends(get_redis_connection)
):
    logger.info(f"Verifying dataset for campaign: {request.onchain_campaign_id}, sample: {request.sample_size}")
    if not WF_CONFIG.FASTAPI_BASE_URL or not requests:
        raise HTTPException(status_code=500, detail="Campaign data access not configured.")

    contributions_endpoint = f"{WF_CONFIG.FASTAPI_BASE_URL}/campaigns/get-contributions/{request.onchain_campaign_id}"
    try:
        response = requests.get(contributions_endpoint, timeout=15)
        response.raise_for_status()
        contributions_data = response.json()
        contributions_to_verify = contributions_data.get("contributions", [])
        if not contributions_to_verify:
            return {"message": f"No contributions for campaign {request.onchain_campaign_id}."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not fetch campaign contributions: {str(e)}")

    if request.sample_size and request.sample_size < len(contributions_to_verify):
        contributions_to_verify = contributions_to_verify[:request.sample_size]

    verifier_workflow_def = await get_or_create_dataset_verifier_workflow_def(db, redis)
    manager = get_workflow_manager_instance(verifier_workflow_def)
    num_triggered = 0
    for contrib_item in contributions_to_verify:
        contribution_id = contrib_item.get("contribution_id")
        data_url = contrib_item.get("data_url")
        if not contribution_id: continue
        task_desc = f"Verify contribution ID '{contribution_id}'. Data URL: '{data_url}'."
        init_scratch = {"contribution_id": contribution_id, "onchain_campaign_id": request.onchain_campaign_id, "data_url_input": data_url}
        thread_id = f"verify_campaign_{request.onchain_campaign_id}_contrib_{contribution_id}_{str(uuid.uuid4())[:4]}"
        background_tasks.add_task(manager.run_workflow, {"task_description": task_desc, "initial_scratchpad": init_scratch}, thread_id)
        num_triggered += 1
    return {
        "message": f"Triggered verification for {num_triggered} contributions. Processing in background.",
        "triggered_count": num_triggered,
        "total_found_in_campaign": len(contributions_data.get("contributions", []))
    }


