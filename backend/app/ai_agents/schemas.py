
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime

from app.ai_agents.enterprise_workflow import  WorkflowDefinition as WFWorkflowDefinition


class AvailableLLMsResponse(BaseModel):
    llms: List[str]

class WorkflowDefinitionIn(BaseModel):
    name: str = Field(..., min_length=3, max_length=100, description="Human-readable name for the workflow.")
    wallet_address: str = Field(..., description="Wallet address of the workflow creator/owner.")
    definition_payload: WFWorkflowDefinition = Field(
        ...,
        description="""
            The complete workflow definition structure. This defines the agents, the steps they take, and how the workflow progresses.

            Think of it like a simple story with characters (agents) who perform tasks (nodes) in a specific order (edges) based on what happens.

            **Key Parts:**

            - **name**: A name for your workflow (like 'Research and Summarize').
            - **agent_configs**: Describes each AI 'character' in your workflow:
                - **name**: A unique name for this AI (like 'WebResearcher').
                - **system_message_template**: The initial instructions you give to this AI (like 'You are a helpful researcher...').
                - **llm_choice**: Which brain this AI will use (see the /llms endpoint for choices like 'google' or 'atoma').
                - **allowed_tools**: What special tools this AI can use (like 'web_search').
            - **nodes**: The different 'tasks' or 'steps' in your workflow:
                - **id**: A unique name for this step (like 'first_search').
                - **agent_config_name**: Which AI from 'agent_configs' will do this step (e.g., 'WebResearcher').
            - **edges**: How the workflow moves from one step to another:
                - **source_node_id**: The step where it's coming from.
                - **target_node_id**: The next step, or 'END' if the workflow finishes here.
                - **condition**: What makes it move to the next step (e.g., 'ALWAYS' means it always goes to the next step, 'ON_TOOL_CALL' means it goes to the next step if the AI used a tool).
            - **start_node_id**: The 'id' of the very first step in your workflow.

            **Example:**

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


class WorkflowDefinitionResponse(BaseModel):
  workflow_id_api: str
  name: str
  wallet_address: str
  definition_payload: WFWorkflowDefinition
  created_at: datetime
  updated_at: Optional[datetime] = None

  class Config:
      from_attributes = True


class WorkflowCreateRequest(BaseModel):
    workflow_definition: WFWorkflowDefinition = Field(..., description="The complete definition of the workflow.")


class WorkflowRunDetailRequest(BaseModel):
    task_description: str = Field(..., description="The initial task or query for the workflow.")
    initial_scratchpad: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Initial data for the workflow's scratchpad.")
    thread_id: Optional[str] = Field(default_None=True, description="Optional thread ID for resuming or tracking a specific workflow run.")


class WorkflowCreateResponse(BaseModel):
    workflow_id: str
    name: str
    status: str
    message: Optional[str] = None


class WorkflowRunResponse(BaseModel):
    thread_id: str
    status: str # e.g., "PENDING", "COMPLETED", "ERROR"
    message: Optional[str] = None
    final_state: Optional[Dict[str, Any]] = None


class ContributionVerificationRequest(BaseModel):
    contribution_id: str = Field(..., description="The database ID of the contribution to verify.")
    onchain_campaign_id: Optional[str] = Field(default_None=True, description="Onchain campaign ID, if contribution_id is not primary.")
    data_url: Optional[str] = Field(default_None=True, description="URL of the data to verify, if not derivable from contribution_id.")

class CampaignVerificationRequest(BaseModel):
    onchain_campaign_id: str = Field(..., description="The onchain ID of the campaign whose contributions need verification.")
    sample_size: Optional[int] = Field(default=None, description="Number of contributions to sample for verification. If None, verifies all.")

