import os
import json
import logging
import requests
import operator # For LangGraph message accumulation
from typing import List, Dict, Any, Annotated, Sequence, Optional
from typing_extensions import TypedDict
from pydantic import BaseModel, Field
from uuid import uuid4

from google import genai
from google.genai import types
from langchain_google_genai import ChatGoogleGenerativeAI



logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)

try:
    import requests # For DataPlatformQueryTool
except ImportError:
    logger.warning("requests library not found. DataPlatformQueryTool will not function. pip install requests")
    requests = None

try:
    from atoma_sdk import AtomaSDK
except ImportError:
    logger.warning("AtomaSDK not found. Atoma LLM functionality will be disabled. pip install atoma-sdk")
    AtomaSDK = None


try:
    from langchain_core.tools import tool, BaseTool
    from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage, SystemMessage
    # from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder # Not explicitly used in this version's AgentNode
    from langgraph.graph import StateGraph, END, START
    from tavily import TavilyClient
    from langgraph.checkpoint.memory import MemorySaver
    from langchain_core.runnables import RunnableConfig
except ImportError:
    logger.error("LangChain core components (tools, messages, prompts, langgraph) not found. Please install langchain, langgraph, langchain-core.")
    raise

# --- Configuration Class ---
class AppConfig:
    ATOMASDK_BEARER_AUTH: Optional[str] = os.getenv("ATOMASDK_BEARER_AUTH")
    GOOGLE_API_KEY: Optional[str] = os.getenv("GEMINI_API_KEY")
    FASTAPI_BASE_URL: Optional[str] = os.getenv("FASTAPI_BASE_URL", "http://localhost:8001")
    DEFAULT_ATOMA_MODEL: str = "Infermatic/Llama-3.3-70B-Instruct-FP8-Dynamic"
    ATOMA_ALT_MODEL_1: str = "deepseek-ai/DeepSeek-V3-0324"
    ATOMA_ALT_MODEL_2: str = "mistralai/Mistral-Nemo-Instruct-2407"
    DEFAULT_GOOGLE_MODEL: str = "gemini-2.5-pro-preview-05-06"
    TAVILY_API_KEY: Optional[str] = os.getenv("TAVILY_API_KEY")

    def __init__(self):
        if self.GOOGLE_API_KEY and genai:
            try:
                client = genai.Client(api_key=self.GOOGLE_API_KEY)
                logger.info("Google Generative AI SDK configured.")
            except Exception as e:
                logger.error(f"Failed to configure Google Generative AI SDK: {e}")
        elif not self.GOOGLE_API_KEY and genai:
             logger.warning("GOOGLE_API_KEY not found. Google LLM functionality will be limited.")

        if not self.ATOMASDK_BEARER_AUTH and AtomaSDK:
            logger.warning("ATOMASDK_BEARER_AUTH not found. Atoma LLM functionality will be limited.")

        if not self.FASTAPI_BASE_URL:
            logger.warning("FASTAPI_BASE_URL not found. DataPlatformQueryTool may not function as intended.")

CONFIG = AppConfig()

# --- LLM Provider Abstraction (Atoma Wrapper) ---
class AtomaLangChainWrapper:
    def __init__(self, model_name: str, api_key: Optional[str]):
        if not AtomaSDK:
            raise ImportError("AtomaSDK is not installed.")
        if not api_key:
            raise ValueError("Atoma API key (bearer auth) is required.")
        self.model_name = model_name
        self.api_key = api_key
        self.logger = logging.getLogger(f"{__name__}.AtomaLangChainWrapper")

    def invoke(self, messages: List[Dict[str, str]], config: Optional[RunnableConfig] = None) -> AIMessage: # Added config for compatibility
        if not AtomaSDK or not self.api_key:
            self.logger.error("AtomaSDK not available or API key missing.")
            return AIMessage(content="Error: AtomaSDK not configured.", id=str(uuid4()))

        self.logger.info(f"Calling Atoma LLM (model: {self.model_name}) with {len(messages)} messages.")
        try:
            with AtomaSDK(bearer_auth=self.api_key) as atoma_sdk:
                completion = atoma_sdk.chat.create(
                    model=self.model_name,
                    messages=messages
                )
                response_content = completion.choices[0].message.content
                tool_calls = []
                # Assuming Atoma's response structure for tool calls might look like this:
                # This is speculative and needs to be adjusted based on Atoma's actual API for tool/function calling.
                if hasattr(completion.choices[0].message, 'tool_calls') and completion.choices[0].message.tool_calls:
                    raw_tool_calls = completion.choices[0].message.tool_calls
                    if isinstance(raw_tool_calls, list):
                        for tc_raw in raw_tool_calls:
                            if isinstance(tc_raw, dict) and 'function' in tc_raw and isinstance(tc_raw['function'], dict):
                                func = tc_raw['function']
                                tool_calls.append({
                                    "id": tc_raw.get('id', str(uuid4())),
                                    "name": func.get('name'),
                                    "args": json.loads(func.get('arguments', '{}')) if isinstance(func.get('arguments'), str) else func.get('arguments', {})
                                })
                            # Adapt further based on actual Atoma response structure
                self.logger.info(f"Atoma LLM Response snippet: {response_content[:100]}...")
                print(f"Atoma LLM Response snippet: {response_content[:100]}...")
                return AIMessage(
                    content=str(response_content),
                    tool_calls=tool_calls if tool_calls is not None else [],
                    id=str(uuid4())
                )
        except Exception as e:
            self.logger.error(f"Error calling Atoma API: {e}", exc_info=True)
            return AIMessage(content=f"Error: Could not get response from Atoma LLM. Details: {e}", id=str(uuid4()))

    def bind_tools(self, tools: List[BaseTool]):
        # For non-LangChain native LLMs, tool binding might involve formatting tool descriptions
        # into the system prompt or using a specific API mechanism if the LLM supports it.
        # This is a placeholder; actual implementation depends on Atoma's capabilities.
        self.logger.info(f"AtomaLangChainWrapper: 'bind_tools' called with {len(tools)} tools. Tool descriptions should be part of the prompt for this wrapper.")
        # You might store formatted tool descriptions here to be included in prompts by AgentNode
        self.bound_tools_descriptions = "\n".join([f"- {tool.name}: {tool.description}" for tool in tools])
        return self


# --- Tool Definitions ---
class DataPlatformQueryTool(BaseTool):
    name: str = "data_platform_query"
    description: str = (
        "Queries the enterprise data platform (FastAPI backend) for specific entities and filters. "
        "Use this to fetch internal structured data."
        "Input should be a JSON object with 'entity_type' (string), 'filters' (object), and optional 'limit' (int)."
    )
    base_url: Optional[str] = None
    logger: logging.Logger = None

    def __init__(self, base_url: Optional[str] = None, **kwargs):
        super().__init__(**kwargs)
        self.base_url = base_url
        self.logger = logging.getLogger(f"{__name__}.DataPlatformQueryTool")
        if not requests:
            self.logger.error("'requests' library is not installed. This tool will not function.")
        if not self.base_url:
            self.logger.warning("FastAPI base_url not provided to DataPlatformQueryTool. It may not function correctly.")


    def _run(self, entity_type: str, filters: Dict[str, Any], limit: int = 10) -> str:
        if not requests:
            return "Error: 'requests' library not installed."
        if not self.base_url:
            return "Error: FastAPI base_url not configured for DataPlatformQueryTool."

        query_payload = {"entity_type": entity_type, "filters": filters, "limit": limit}
        endpoint = f"{self.base_url}/query" # Assuming a /query endpoint
        self.logger.info(f"Querying data platform at {endpoint} with payload: {query_payload}")
        try:
            response = requests.post(endpoint, json=query_payload, timeout=10) # Added timeout
            response.raise_for_status()  # Raises an HTTPError for bad responses (4XX or 5XX)
            return json.dumps(response.json())
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Error querying data platform: {e}", exc_info=True)
            return json.dumps({"error": f"Failed to query data platform: {str(e)}"})
        except json.JSONDecodeError:
            self.logger.error(f"Error decoding JSON response from data platform: {response.text}", exc_info=True)
            return json.dumps({"error": "Invalid JSON response from data platform."})


    async def _arun(self, entity_type: str, filters: Dict[str, Any], limit: int = 10) -> str:
        # For a true async version, you'd use an async HTTP client like httpx
        self.logger.warning("DataPlatformQueryTool._arun is using synchronous requests. For true async, use an async HTTP client.")
        return self._run(entity_type, filters, limit)



class TavilySearchTool(BaseTool):
    name: str = "web_search"
    description: str = (
        "Performs a web search using the Tavily API to find up-to-date information. "
        "Input should be a search query string and the desired number of results."
    )
    max_results: int = 3
    tavily_api_key: Optional[str] = None
    tavily_client: Optional[TavilyClient] = None  # Initialize as None

    def __init__(self, max_results: int = 3, tavily_api_key: Optional[str] = None, **kwargs):
        super().__init__(**kwargs)
        self.max_results = max_results
        if not tavily_api_key:
            tavily_api_key = os.getenv("TAVILY_API_KEY")
            if not tavily_api_key:
                raise ValueError("TAVILY_API_KEY environment variable not set.")
        self.tavily_api_key = tavily_api_key
        try:
            self.tavily_client = TavilyClient(api_key=self.tavily_api_key)
        except Exception as e:
            logger.error(f"Error initializing TavilyClient: {e}")
            raise

    def _run(self, query: str, num_results: Optional[int] = None, **kwargs) -> str:
        search_results = self.tavily_client.search(
            query=query,
            limit=num_results if num_results is not None else self.max_results
        )
        results = []
        for item in search_results.results:
            results.append({
                "title": item.title,
                "url": item.url,
                "snippet": item.content
            })
        return json.dumps(results, ensure_ascii=False)

    async def _arun(self, query: str, num_results: Optional[int] = None, **kwargs) -> str:
        # Tavily client is synchronous, so we run it in a thread pool for async
        import asyncio
        from functools import partial

        loop = asyncio.get_running_loop()
        sync_run = partial(self._run, query=query, num_results=num_results, **kwargs)
        return await loop.run_in_executor(None, sync_run)



class ToolRegistry:
    def __init__(self, app_config: "AppConfig"):  # Use string literal for forward reference
        self.tools: Dict[str, BaseTool] = {}
        self.app_config = app_config
        self.logger = logging.getLogger(f"{__name__}.ToolRegistry")  # Initialize logger here
        self._register_default_tools()

    def _register_default_tools(self):
        tavily_api_key = self.app_config.TAVILY_API_KEY
        if not tavily_api_key:
            self.logger.warning("TAVILY_API_KEY environment variable not found in AppConfig. TavilySearchTool will not function.")
        else:
            self.add_tool(TavilySearchTool(tavily_api_key=tavily_api_key))

        self.add_tool(DataPlatformQueryTool(base_url=self.app_config.FASTAPI_BASE_URL))

    def add_tool(self, tool_instance: BaseTool):
        if not tool_instance.name:
            raise ValueError("Tool must have a name.")
        self.tools[tool_instance.name] = tool_instance
        self.logger.info(f"Registered tool: {tool_instance.name}")

    def get_tool(self, name: str) -> Optional[BaseTool]:
        return self.tools.get(name)

    def get_tools_by_names(self, names: List[str]) -> List[BaseTool]:
        return [self.tools[name] for name in names if name in self.tools]


# --- LangGraph Agent State ---
class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], operator.add]
    agent_name: str
    workflow_scratchpad: Dict[str, Any]
    # Dynamic fields for routing or specific agent outputs can be added if needed
    current_task_description: Optional[str] # Example of a dynamic field


# --- Agent Node Logic ---
class AgentNode:
    def __init__(self, llm_provider: Any, system_message_template: str, tools: List[BaseTool], agent_config_name: str):
        self.llm_provider = llm_provider
        self.system_message_template = system_message_template
        self.tools = tools
        self.agent_config_name = agent_config_name # Using the config name for clarity
        self.logger = logging.getLogger(f"{__name__}.AgentNode.{self.agent_config_name}")

        if hasattr(llm_provider, 'bind_tools') and not isinstance(llm_provider, AtomaLangChainWrapper): # Don't bind for AtomaWrapper if it handles tools via prompt
             self.llm_with_tools = self.llm_provider.bind_tools(tools)
        else:
            self.llm_with_tools = self.llm_provider
            self.logger.info(f"LLM provider for agent '{agent_config_name}' might not natively support LangChain 'bind_tools' or is Atoma. Tool descriptions may need to be in prompt.")


    def invoke(self, state: AgentState, config: Optional[RunnableConfig] = None) -> AgentState:
        self.logger.info(f"Invoked. Current task: {state.get('current_task_description', 'N/A')}")
        current_messages = state['messages']
        
        # Prepare system message, potentially including tool descriptions for non-binding LLMs
        system_message_content = self.system_message_template.format(
            agent_name=self.agent_config_name,
            # Add other dynamic parts to system_message_template if needed
        )
        # For Atoma or similar, append tool descriptions if they are not bound via API
        if isinstance(self.llm_provider, AtomaLangChainWrapper) and hasattr(self.llm_provider, 'bound_tools_descriptions'):
            system_message_content += f"\n\nAvailable tools:\n{self.llm_provider.bound_tools_descriptions}"


        constructed_prompt_messages: List[BaseMessage] = [SystemMessage(content=system_message_content)]
        constructed_prompt_messages.extend(current_messages)

        if isinstance(self.llm_provider, AtomaLangChainWrapper):
            # Convert to Atoma's expected dict format
            llm_input_messages_dict = []
            for msg in constructed_prompt_messages:
                role = "user" # default
                if msg.type == "system": role = "system"
                elif msg.type == "ai": role = "assistant"
                elif msg.type == "human": role = "user"
                elif msg.type == "tool": # Atoma might expect tool results differently
                    role = "tool" # Or map to user/system if Atoma's API requires it
                                  # LangChain's ChatGoogleGenerativeAI maps tool role to 'user' with specific formatting.
                                  # Atoma might need similar custom handling if it doesn't support 'tool' role directly.
                                  # For now, assuming 'tool' role is okay or Atoma wrapper handles it.
                content = msg.content
                # If Atoma needs tool calls in a specific input format, adjust here.
                # This example assumes Atoma's `chat.create` handles LangChain-style messages or the wrapper adapts them.
                llm_input_messages_dict.append({"role": role, "content": content})
            ai_response: AIMessage = self.llm_with_tools.invoke(llm_input_messages_dict, config=config)
        else: # Assuming LangChain compatible LLM (e.g., ChatGoogleGenerativeAI)
            ai_response: AIMessage = self.llm_with_tools.invoke(constructed_prompt_messages, config=config)

        self.logger.info(f"LLM Response snippet: {ai_response.content[:100]}...")
        if ai_response.tool_calls:
             self.logger.info(f"Detected tool calls: {ai_response.tool_calls}")

        # Update agent_name in state to reflect which agent produced the last AIMessage
        return {"messages": [ai_response], "agent_name": self.agent_config_name, "workflow_scratchpad": state.get("workflow_scratchpad", {})}


# --- Tool Execution Node ---
def tool_executor_node_factory(tool_registry: ToolRegistry):
    node_logger = logging.getLogger(f"{__name__}.ToolExecutorNode")
    def tool_executor_node(state: AgentState) -> AgentState:
        node_logger.info("Invoked.")
        last_message = state['messages'][-1]

        if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
            node_logger.info("No tool calls found in the last message.")
            return {"messages": [], "agent_name": "ToolExecutor", "workflow_scratchpad": state.get("workflow_scratchpad", {})} # Return empty if no tools

        tool_messages: List[ToolMessage] = []
        for tool_call in last_message.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]
            tool_id = tool_call["id"]

            selected_tool = tool_registry.get_tool(tool_name)
            if not selected_tool:
                error_msg = f"Error: Tool '{tool_name}' not found."
                node_logger.error(error_msg)
                tool_messages.append(ToolMessage(content=error_msg, tool_call_id=tool_id, name=tool_name)) # Added name to ToolMessage
                continue
            try:
                node_logger.info(f"Executing tool '{tool_name}' with args: {tool_args}")
                observation = selected_tool.invoke(tool_args) # LangChain tools handle dict inputs for args
                node_logger.info(f"Tool '{tool_name}' output snippet: {str(observation)[:100]}...")
                tool_messages.append(ToolMessage(content=str(observation), tool_call_id=tool_id, name=tool_name))
            except Exception as e:
                error_msg = f"Error executing tool '{tool_name}': {e}"
                node_logger.exception(error_msg)
                tool_messages.append(ToolMessage(content=error_msg, tool_call_id=tool_id, name=tool_name))
        return {"messages": tool_messages, "agent_name": "ToolExecutor", "workflow_scratchpad": state.get("workflow_scratchpad", {})}
    return tool_executor_node


# --- Workflow Definition Data Structures ---
class AgentConfigData(BaseModel):
    name: str = Field(..., min_length=3, max_length=100, description="Unique name for this agent configuration (e.g., 'researcher', 'summarizer').")
    system_message_template: str = Field(..., description="The initial instructions for the agent, can include placeholders like '{agent_name}'.")
    llm_choice: str = Field(..., description="The LLM to use for this agent (e.g., 'google', 'atoma'). See the /llms endpoint for available options.")
    allowed_tools: List[str] = Field(default=[], description="List of tool names this agent is allowed to use (e.g., ['web_search', 'data_platform_query']).")

class WorkflowNodeData(BaseModel):
    id: str = Field(..., description="Unique identifier for this step in the workflow (e.g., 'research_step_1', 'analysis_step').")
    agent_config_name: str = Field(..., description="The 'name' of the agent configuration to use for this step.")

class WorkflowEdgeData(BaseModel):
    source_node_id: str = Field(..., description="The 'id' of the step where the workflow comes from.")
    target_node_id: str = Field(..., description="The 'id' of the next step, or 'END' to finish the workflow.")
    condition: str = Field(..., description="The condition for moving to the next step (e.g., 'ALWAYS', 'ON_TOOL_CALL', 'ON_NO_TOOL_CALL').")

class WorkflowDefinitionPayload(BaseModel):
    name: str = Field(..., min_length=3, max_length=100, description="Name of the workflow definition.")
    agent_configs: List[AgentConfigData] = Field(..., description="A list of agent configurations that can be used in the workflow.")
    nodes: List[WorkflowNodeData] = Field(..., description="A list of steps in the workflow, each using one of the defined agents.")
    edges: List[WorkflowEdgeData] = Field(..., description="A list of connections between the steps, defining the flow of the workflow based on conditions.")
    start_node_id: str = Field(..., description="The 'id' of the first step in the workflow.")

class WorkflowDefinition(BaseModel):
    name: str
    agent_configs: List[AgentConfigData]
    nodes: List[WorkflowNodeData]
    edges: List[WorkflowEdgeData]
    start_node_id: str

# --- Graph Definition and Workflow Management ---
class EnterpriseWorkflowManager:
    def __init__(self, workflow_definition: WorkflowDefinition, app_config: AppConfig, persistence_db: Optional[str] = "workflow_state"):
        self.workflow_definition = workflow_definition
        self.app_config = app_config
        self.tool_registry = ToolRegistry(app_config=app_config)
        self.graph_builder = StateGraph(AgentState)
        self.memory = MemorySaver() if persistence_db else None
        self.agent_nodes: Dict[str, AgentNode] = {} # Store instantiated AgentNode objects
        self.logger = logging.getLogger(f"{__name__}.EnterpriseWorkflowManager.{workflow_definition.name}")
        self._compile_workflow()

    def _get_llm_provider(self, choice: str):
        # (Copied and adapted from previous version)
        if choice.lower() == "google" and ChatGoogleGenerativeAI and self.app_config.GOOGLE_API_KEY:
            self.logger.info(f"Using Google LLM: {self.app_config.DEFAULT_GOOGLE_MODEL}")
            return ChatGoogleGenerativeAI(model=self.app_config.DEFAULT_GOOGLE_MODEL, convert_system_message_to_human=True) # Often needed for Gemini
        elif choice.lower() == "atoma" and AtomaSDK and self.app_config.ATOMASDK_BEARER_AUTH:
            self.logger.info(f"Using Atoma LLM: {self.app_config.DEFAULT_ATOMA_MODEL}")
            return AtomaLangChainWrapper(model_name=self.app_config.DEFAULT_ATOMA_MODEL, api_key=self.app_config.ATOMASDK_BEARER_AUTH)
        else:
            self.logger.warning(f"LLM provider '{choice}' not available or not configured. Falling back to EchoLLM.")
            class EchoLLM:
                def __init__(self):
                    self.logger = logging.getLogger(f"{__name__}.EchoLLM")
                def invoke(self, messages, config=None): return AIMessage(content=f"Echo: No real LLM. Input: {messages[-1].content if messages else 'N/A'}", id=str(uuid4()))
                def bind_tools(self, tools): self.logger.info("EchoLLM: bind_tools called."); return self
            return EchoLLM()

    def _compile_workflow(self):
        self.logger.info(f"Compiling workflow: {self.workflow_definition.name}")

        print(self.workflow_definition.definition_payload)

        # 1. Instantiate Agent Nodes based on agent_configs and workflow_nodes
        agent_configs_map = {ac.name: ac for ac in self.workflow_definition.definition_payload.agent_configs}

        for node_data in self.workflow_definition.definition_payload.nodes:
            node_id = node_data.id
            agent_config_name = node_data.agent_config_name
            if agent_config_name not in agent_configs_map:
                raise ValueError(f"Agent configuration '{agent_config_name}' for node '{node_id}' not found in workflow definition.")

            
            agent_config = agent_configs_map[agent_config_name]
            llm_provider = self._get_llm_provider(agent_config.llm_choice)
            tools_for_agent = self.tool_registry.get_tools_by_names(agent_config.allowed_tools)
            
            agent_node_instance = AgentNode(
                llm_provider=llm_provider,
                system_message_template=agent_config.system_message_template,
                tools=tools_for_agent,
                agent_config_name=agent_config.name # Use the config name for the AgentNode
            )
            self.agent_nodes[node_id] = agent_node_instance
            self.graph_builder.add_node(node_id, agent_node_instance.invoke)
            self.logger.info(f"Added agent node '{node_id}' to graph, using agent config '{agent_config_name}'.")

        # 2. Add Tool Executor Node
        tool_executor = tool_executor_node_factory(self.tool_registry)
        self.graph_builder.add_node("tool_executor", tool_executor)
        self.logger.info("Added 'tool_executor' node to graph.")

        # 3. Define Edges based on workflow_edges
        self.graph_builder.set_entry_point(self.workflow_definition.definition_payload.start_node_id)
        self.logger.info(f"Set graph entry point to '{self.workflow_definition.definition_payload.start_node_id}'.")

        for edge_data in self.workflow_definition.definition_payload.edges:
            source_id = edge_data.source_node_id
            target_id = edge_data.target_node_id
            condition = edge_data.condition.upper() # Normalize condition

            if source_id not in self.agent_nodes and source_id != START and source_id != "tool_executor":
                self.logger.warning(f"Source node '{source_id}' for edge not found in defined nodes. Skipping edge.")
                continue

            if condition == "ALWAYS":
                if target_id != "END":
                    self.graph_builder.add_edge(source_id, target_id)
                    self.logger.info(f"Added ALWAYS edge from '{source_id}' to '{target_id}'.")
                else:
                    self.logger.info(f"Node '{source_id}' will lead to the end of the workflow.")
            else: # Conditional edge
                def specific_router(state: AgentState, current_source_id=source_id) -> str:
                    self.logger.debug(f"Router for '{current_source_id}': Evaluating state.")
                    last_message = state.messages[-1] if state.messages else None
                    has_tool_calls = isinstance(last_message, AIMessage) and bool(last_message.tool_calls)
                    
                    for e in self.workflow_definition.definition_payload.edges:
                        if e.source_node_id == current_source_id:
                            if e.condition.upper() == "ON_TOOL_CALL" and has_tool_calls:
                                self.logger.info(f"Router for '{current_source_id}': Condition ON_TOOL_CALL met. Routing to '{e.target_node_id}'.")
                                return e.target_node_id
                            elif e.condition.upper() == "ON_NO_TOOL_CALL" and not has_tool_calls:
                                self.logger.info(f"Router for '{current_source_id}': Condition ON_NO_TOOL_CALL met. Routing to '{e.target_node_id}'.")
                                return e.target_node_id
                    
                    self.logger.warning(f"Router for '{current_source_id}': No matching condition found. Defaulting to END.")
                    return END # Or handle this differently based on your workflow logic

                conditional_map = {}
                for e_data in self.workflow_definition.definition_payload.edges:
                    if e_data.source_node_id == source_id and e_data.condition.upper() != "ALWAYS":
                        if e_data.condition.upper() == "ON_TOOL_CALL" and e_data.target_node_id != "END":
                            conditional_map["tool_executor"] = e_data.target_node_id # Should point to tool_executor
                        elif e_data.condition.upper() == "ON_NO_TOOL_CALL" and e_data.target_node_id != "END":
                            conditional_map["no_tool_call"] = e_data.target_node_id
                        elif e_data.condition.upper() not in ["ON_TOOL_CALL", "ON_NO_TOOL_CALL"] and e_data.target_node_id != "END":
                            conditional_map[e_data.condition.lower()] = e_data.target_node_id # For other custom conditions

                if conditional_map:
                    # Need to define a routing function that uses the conditions
                    def router(state: AgentState, current_node_id=source_id, conditions_map=conditional_map):
                        last_message = state.messages[-1] if state.messages else None
                        has_tool_calls = isinstance(last_message, AIMessage) and bool(last_message.tool_calls)

                        for condition, target in conditions_map.items():
                            if condition == "on_tool_call" and has_tool_calls:
                                return "tool_executor" # Always route to tool executor
                            elif condition == "on_no_tool_call" and not has_tool_calls:
                                return target
                            # Add more conditions as needed
                        return END # Default if no condition met

                    # LangGraph's add_conditional_edges expects a mapping of output of the router to the next node
                    routing_map = {}
                    for edge in self.workflow_definition.definition_payload.edges:
                        if edge.source_node_id == source_id and edge.target_node_id != "END":
                            if edge.condition.upper() == "ON_TOOL_CALL":
                                routing_map["tool_executor"] = "tool_executor"
                            elif edge.condition.upper() == "ON_NO_TOOL_CALL":
                                routing_map["no_tool_call"] = edge.target_node_id
                            else:
                                routing_map[edge.condition.lower()] = edge.target_node_id

                    if routing_map:
                        def router_func(state):
                            last_message = state.messages[-1] if state.messages else None
                            has_tool_calls = isinstance(last_message, AIMessage) and bool(last_message.tool_calls)
                            for edge in self.workflow_definition.definition_payload.edges:
                                if edge.source_node_id == source_id:
                                    if edge.condition.upper() == "ON_TOOL_CALL" and has_tool_calls:
                                        return edge.target_node_id # Should be 'tool_executor'
                                    elif edge.condition.upper() == "ON_NO_TOOL_CALL" and not has_tool_calls:
                                        return edge.target_node_id
                                    # Add other conditions if needed
                            return END

                        conditional_edges = {}
                        for edge in self.workflow_definition.definition_payload.edges:
                            if edge.source_node_id == source_id and edge.target_node_id != "END":
                                if edge.condition.upper() == "ON_TOOL_CALL":
                                    conditional_edges["tool_executor"] = edge.target_node_id
                                elif edge.condition.upper() == "ON_NO_TOOL_CALL":
                                    conditional_edges["no_tool_call"] = edge.target_node_id
                                else:
                                    conditional_edges[edge.condition.lower()] = edge.target_node_id

                        if conditional_edges:
                            self.graph_builder.add_conditional_edges(source_id, router_func, {k: v for k, v in conditional_edges.items() if v != "END"})
                            self.logger.info(f"Added conditional edges from '{source_id}' with routes: {conditional_edges}")


        # Compile the graph
        self.runnable_graph = self.graph_builder.compile(checkpointer=self.memory)
        self.logger.info("Workflow graph compiled successfully.")


    def run_workflow(self, initial_input: Dict[str, Any], thread_id: Optional[str] = None) -> Dict[str, Any]:
        if not thread_id:
            thread_id = str(uuid4())
        
        config: RunnableConfig = {"configurable": {"thread_id": thread_id}}
        
        self.logger.info(f"Running workflow '{self.workflow_definition.name}' for input: '{initial_input.get('task_description', 'N/A')}' with thread_id: {thread_id}")
        
        # Initial state for the graph
        # 'messages' should typically start with a HumanMessage containing the initial task/query
        initial_messages = [HumanMessage(content=initial_input.get('task_description', 'No task description provided.'))]
        
        inputs_state = AgentState(
            messages=initial_messages,
            agent_name="WorkflowInitiator", # Identifies the origin of the first message
            workflow_scratchpad=initial_input.get("initial_scratchpad", {}),
            current_task_description=initial_input.get('task_description')
        )

        final_state = None
        try:
            for event_chunk in self.runnable_graph.stream(inputs_state, config=config, stream_mode="values"):
                self.logger.debug(f"\nWorkflow step output for thread {thread_id} (Agent: {event_chunk.get('agent_name')}):")
                # Log messages more selectively to avoid too much noise
                if event_chunk.get("messages"):
                    for msg_idx, msg in enumerate(event_chunk["messages"]):
                         self.logger.debug(f"  Msg[{msg_idx}] {msg.type}: {str(msg.content)[:120]}... " + (f"Tool Calls: {msg.tool_calls}" if hasattr(msg, 'tool_calls') and msg.tool_calls else ""))
                final_state = event_chunk

            self.logger.info(f"Workflow '{self.workflow_definition.name}' completed for thread_id: {thread_id}")
            return final_state if final_state else {}
        except Exception as e:
            self.logger.error(f"Error during workflow execution for thread_id {thread_id}: {e}", exc_info=True)
            return {"error": str(e), "messages": []}


# --- Main Application Entry Point ---
if __name__ == "__main__":
    logger.info("Initializing Dynamic Enterprise Multi-Agent System...")

    # Example Workflow Definition
    # This would ideally be loaded from a JSON/YAML file or a database in a real system
    sample_research_workflow: WorkflowDefinition = {
        "name": "BasicResearchAndSummarize",
        "agent_configs": [
            {
                "name": "WebResearcherAgent",
                "system_message_template": "You are a Web Research Agent ({agent_name}). Your task is to find information on the internet about a given topic. Use the 'web_search' tool. If you find relevant information, provide it. If you need to search more, call the tool again. Once you have sufficient information, state your findings clearly.",
                "llm_choice": "google", # or "atoma" if configured
                "allowed_tools": ["web_search"]
            },
            {
                "name": "DataPlatformAnalystAgent",
                "system_message_template": "You are a Data Platform Analyst ({agent_name}). Your task is to query our internal data platform for information related to the user's request. Use the 'data_platform_query' tool with appropriate 'entity_type' and 'filters'. Analyze the results and provide insights.",
                "llm_choice": "google",
                "allowed_tools": ["data_platform_query"]
            },
            {
                "name": "ConsolidatorSummarizerAgent",
                "system_message_template": "You are a Consolidator and Summarizer Agent ({agent_name}). You will receive information from other agents (web research, data platform analysis). Your job is to consolidate all this information and provide a comprehensive summary. Do not use any tools.",
                "llm_choice": "atoma",
                "allowed_tools": []
            }
        ],
        "nodes": [
            {"id": "web_research_step", "agent_config_name": "WebResearcherAgent"},
            {"id": "platform_analysis_step", "agent_config_name": "DataPlatformAnalystAgent"},
            {"id": "summarize_step", "agent_config_name": "ConsolidatorSummarizerAgent"}
        ],
        "edges": [
            # From web_research_step
            {"source_node_id": "web_research_step", "target_node_id": "tool_executor", "condition": "ON_TOOL_CALL"},
            {"source_node_id": "web_research_step", "target_node_id": "platform_analysis_step", "condition": "ON_NO_TOOL_CALL"}, # If web researcher is done, move to platform analysis
            
            # From tool_executor (after web_search call)
            {"source_node_id": "tool_executor", "target_node_id": "web_research_step", "condition": "ALWAYS"}, 
            # From platform_analysis_step
            {"source_node_id": "platform_analysis_step", "target_node_id": "tool_executor", "condition": "ON_TOOL_CALL"},
            {"source_node_id": "platform_analysis_step", "target_node_id": "summarize_step", "condition": "ON_NO_TOOL_CALL"},

            # From summarize_step
            {"source_node_id": "summarize_step", "target_node_id": END, "condition": "ALWAYS"} # Summarizer is the last step
        ],
        "start_node_id": "web_research_step"
    }


    # Corrected Edges for the sample workflow:
    sample_research_workflow["edges"] = [
        # Web Researcher
        {"source_node_id": "web_research_step", "target_node_id": "tool_executor", "condition": "ON_TOOL_CALL"},
        {"source_node_id": "web_research_step", "target_node_id": "platform_analysis_step", "condition": "ON_NO_TOOL_CALL"}, # If done with web research

        # Data Platform Analyst
        {"source_node_id": "platform_analysis_step", "target_node_id": "tool_executor", "condition": "ON_TOOL_CALL"},
        {"source_node_id": "platform_analysis_step", "target_node_id": "summarize_step", "condition": "ON_NO_TOOL_CALL"}, # If done with platform analysis

        # Summarizer
        {"source_node_id": "summarize_step", "target_node_id": END, "condition": "ON_NO_TOOL_CALL"}, # Always ends after summarizing (no tools)
        # No ON_TOOL_CALL for summarizer as it has no tools.

        # Tool Executor routing (implicit: back to the calling node)
        # LangGraph handles this by re-invoking the node that produced the tool call,
        # now with the ToolMessage in the state. So, no explicit edges *from* tool_executor are needed in this declarative list
        # if we rely on the agent's own router to decide next step after processing tool results.
        # However, if tool_executor were a generic dispatcher, it would need edges.
        # For LangGraph, the conditional edge from the agent node itself handles the "what next" after a tool call (implicitly after tool_executor runs).
        # The key in the conditional map (e.g. "tool_executor") IS the node to go to if condition met.
    ]


    # Initialize the workflow manager
    # Ensure FASTAPI_BASE_URL is set in your environment if using DataPlatformQueryTool
    if not CONFIG.FASTAPI_BASE_URL:
        logger.warning("FASTAPI_BASE_URL is not set. The DataPlatformQueryTool in the example workflow might not work.")
        # You might want to provide a default mock URL for the tool if FASTAPI_BASE_URL is not set,
        # or the tool itself should handle it more gracefully (it currently returns an error string).

    workflow_manager = EnterpriseWorkflowManager(
        workflow_definition=sample_research_workflow,
        app_config=CONFIG,
        persistence_db=":memory:" # Use ":memory:" for demo, or "workflow_states.sqlite" for file persistence
    )

    # --- Example Workflow Invocation ---
    task_input_1 = {
        "task_description": "Find information about the Atoma SDK and also query our internal platform for 'atoma_sdk_integration_notes'.",
        "initial_scratchpad": {"project_id": "alpha-123"}
    }
    
    thread_id_1 = "workflow_run_" + str(uuid4())
    logger.info(f"\n--- Starting Workflow '{sample_research_workflow['name']}' for Task 1 (Thread: {thread_id_1}) ---")
    final_state_1 = workflow_manager.run_workflow(task_input_1, thread_id=thread_id_1)
    
    logger.info(f"\n--- Final State for Task 1 (Thread: {thread_id_1}) ---")
    if final_state_1:
        logger.info(f"Final Agent: {final_state_1.get('agent_name')}")
        logger.info("Final Messages:")
        for msg in final_state_1.get("messages", []):
            logger.info(f"  {msg.type}: {str(msg.content)[:250]}...")
        logger.info(f"Final Scratchpad: {final_state_1.get('workflow_scratchpad')}")
    else:
        logger.info("  Workflow did not return a final state.")

    logger.info("System finished.")
