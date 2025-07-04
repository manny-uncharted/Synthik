import os
import json
import logging
import operator # For LangGraph message accumulation
from typing import List, Dict, Any, TypedDict, Annotated, Sequence, Optional
from uuid import uuid4

# --- Environment Variable Setup (Important!) ---
# Ensure these are set in your environment:
# ATOMASDK_BEARER_AUTH="your_atoma_bearer_token"
# GOOGLE_API_KEY="your_google_ai_studio_api_key"
# FASTAPI_BASE_URL="your_fastapi_data_platform_base_url" (e.g., http://localhost:8000)

# --- Logging Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Attempt to import necessary libraries ---
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
    import google.generativeai as genai
    from langchain_google_genai import ChatGoogleGenerativeAI
except ImportError:
    logger.warning("Google Generative AI SDK or LangChain Google integration not found. Google LLM functionality will be disabled. pip install google-generativeai langchain-google-genai")
    genai = None
    ChatGoogleGenerativeAI = None

try:
    from langchain_core.tools import tool, BaseTool
    from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage, SystemMessage
    # from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder # Not explicitly used in this version's AgentNode
    from langgraph.graph import StateGraph, END, START
    from langgraph.checkpoint.sqlite import SqliteSaver
    from langchain_core.runnables import RunnableConfig
except ImportError:
    logger.error("LangChain core components (tools, messages, prompts, langgraph) not found. Please install langchain, langgraph, langchain-core.")
    raise

# --- Configuration Class ---
class AppConfig:
    ATOMASDK_BEARER_AUTH: Optional[str] = os.getenv("ATOMASDK_BEARER_AUTH")
    GOOGLE_API_KEY: Optional[str] = os.getenv("GOOGLE_API_KEY")
    FASTAPI_BASE_URL: Optional[str] = os.getenv("FASTAPI_BASE_URL")
    DEFAULT_ATOMA_MODEL: str = "Infermatic/Llama-3.3-70B-Instruct-FP8-Dynamic"
    DEFAULT_GOOGLE_MODEL: str = "gemini-1.5-flash-latest"

    def __init__(self):
        if self.GOOGLE_API_KEY and genai:
            try:
                genai.configure(api_key=self.GOOGLE_API_KEY)
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
                return AIMessage(
                    content=str(response_content),
                    tool_calls=tool_calls if tool_calls else None,
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
    base_url: Optional[str]
    logger: logging.Logger

    def __init__(self, base_url: Optional[str] = None, **kwargs):
        super().__init__(**kwargs) # Pass kwargs to BaseTool
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

@tool
def web_search(query: str, num_results: int = 3) -> str:
    """ (Copied from previous version, placeholder) """
    logger.info(f"Performing web search for: '{query}' (num_results: {num_results})")
    mock_results = [
        {"title": f"Mock Result 1 for '{query}'", "url": f"https://example.com/search?q={query.replace(' ', '+')}&r=1", "snippet": "This is a simulated search result snippet about " + query},
        {"title": f"Mock Result 2 for '{query}'", "url": f"https://example.com/search?q={query.replace(' ', '+')}&r=2", "snippet": "Another piece of information related to " + query},
    ]
    return json.dumps(mock_results[:num_results])

class WebSearchTool(BaseTool):
    name: str = "web_search"
    description: str = (
        "Performs a web search for the given query. Use this for finding up-to-date information. "
        "Input should be a search query string."
    )
    def _run(self, query: str, num_results: int = 3, **kwargs) -> str:
        return web_search.invoke({"query": query, "num_results": num_results})
    async def _arun(self, query: str, num_results: int = 3, **kwargs) -> str:
        return self._run(query, num_results)

class ToolRegistry:
    def __init__(self, app_config: AppConfig):
        self.tools: Dict[str, BaseTool] = {}
        self.app_config = app_config
        self._register_default_tools()
        self.logger = logging.getLogger(f"{__name__}.ToolRegistry")

    def _register_default_tools(self):
        self.add_tool(WebSearchTool())
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
class AgentConfigData(TypedDict):
    name: str # Unique name for this agent configuration
    system_message_template: str
    llm_choice: str # e.g., "google", "atoma"
    allowed_tools: List[str] # Names of tools from ToolRegistry

class WorkflowNodeData(TypedDict):
    id: str # Unique ID for this node in the graph (e.g., "research_step_1")
    agent_config_name: str # Maps to AgentConfigData's name
    # You could add input/output mappings or specific prompt parameters here if needed

class WorkflowEdgeData(TypedDict):
    source_node_id: str # ID of the source WorkflowNodeData
    target_node_id: str # ID of the target WorkflowNodeData or END
    # Condition for this edge: "ALWAYS", "ON_TOOL_CALL", "ON_NO_TOOL_CALL"
    # Or a key to a custom conditional function. For now, we'll use these strings.
    condition: str

class WorkflowDefinition(TypedDict):
    name: str
    agent_configs: List[AgentConfigData]
    nodes: List[WorkflowNodeData]
    edges: List[WorkflowEdgeData]
    start_node_id: str

# --- Graph Definition and Workflow Management ---
class EnterpriseWorkflowManager:
    def __init__(self, workflow_definition: WorkflowDefinition, app_config: AppConfig, persistence_db: Optional[str] = "workflow_state.sqlite"):
        self.workflow_definition = workflow_definition
        self.app_config = app_config
        self.tool_registry = ToolRegistry(app_config=app_config)
        self.graph_builder = StateGraph(AgentState)
        self.memory = SqliteSaver.from_conn_string(persistence_db) if persistence_db else None
        self.agent_nodes: Dict[str, AgentNode] = {} # Store instantiated AgentNode objects
        self.logger = logging.getLogger(f"{__name__}.EnterpriseWorkflowManager.{workflow_definition['name']}")
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
        self.logger.info(f"Compiling workflow: {self.workflow_definition['name']}")

        # 1. Instantiate Agent Nodes based on agent_configs and workflow_nodes
        agent_configs_map = {ac['name']: ac for ac in self.workflow_definition['agent_configs']}

        for node_data in self.workflow_definition['nodes']:
            node_id = node_data['id']
            agent_config_name = node_data['agent_config_name']
            if agent_config_name not in agent_configs_map:
                raise ValueError(f"Agent configuration '{agent_config_name}' for node '{node_id}' not found in workflow definition.")
            
            agent_config = agent_configs_map[agent_config_name]
            llm_provider = self._get_llm_provider(agent_config['llm_choice'])
            tools_for_agent = self.tool_registry.get_tools_by_names(agent_config['allowed_tools'])
            
            agent_node_instance = AgentNode(
                llm_provider=llm_provider,
                system_message_template=agent_config['system_message_template'],
                tools=tools_for_agent,
                agent_config_name=agent_config['name'] # Use the config name for the AgentNode
            )
            self.agent_nodes[node_id] = agent_node_instance
            self.graph_builder.add_node(node_id, agent_node_instance.invoke)
            self.logger.info(f"Added agent node '{node_id}' to graph, using agent config '{agent_config_name}'.")

        # 2. Add Tool Executor Node
        tool_executor = tool_executor_node_factory(self.tool_registry)
        self.graph_builder.add_node("tool_executor", tool_executor)
        self.logger.info("Added 'tool_executor' node to graph.")

        # 3. Define Edges based on workflow_edges
        self.graph_builder.set_entry_point(self.workflow_definition['start_node_id'])
        self.logger.info(f"Set graph entry point to '{self.workflow_definition['start_node_id']}'.")

        for edge_data in self.workflow_definition['edges']:
            source_id = edge_data['source_node_id']
            target_id = edge_data['target_node_id'] # Can be another node_id or END
            condition = edge_data['condition'].upper() # Normalize condition

            if source_id not in self.agent_nodes and source_id != START: # START is not an agent node
                 # Allow edges from tool_executor as well
                if source_id != "tool_executor":
                    self.logger.warning(f"Source node '{source_id}' for edge not found in defined agent nodes. Skipping edge.")
                    continue
            
            if condition == "ALWAYS":
                self.graph_builder.add_edge(source_id, target_id)
                self.logger.info(f"Added ALWAYS edge from '{source_id}' to '{target_id}'.")
            else: # Conditional edge, typically from an agent node
                # Define a router function for conditional edges from agent nodes
                def router_function(state: AgentState) -> str:
                    self.logger.debug(f"Router for '{source_id}': Evaluating state. Last message type: {type(state['messages'][-1]) if state['messages'] else 'No messages'}")
                    last_message = state['messages'][-1] if state['messages'] else None
                    has_tool_calls = isinstance(last_message, AIMessage) and bool(last_message.tool_calls)
                    
                    # Find the relevant conditional edges for this source_id
                    possible_targets = {}
                    for e in self.workflow_definition['edges']:
                        if e['source_node_id'] == source_id:
                            if e['condition'].upper() == "ON_TOOL_CALL" and has_tool_calls:
                                self.logger.info(f"Router for '{source_id}': Condition ON_TOOL_CALL met. Routing to '{e['target_node_id']}'.")
                                return e['target_node_id']
                            elif e['condition'].upper() == "ON_NO_TOOL_CALL" and not has_tool_calls:
                                self.logger.info(f"Router for '{source_id}': Condition ON_NO_TOOL_CALL met. Routing to '{e['target_node_id']}'.")
                                return e['target_node_id']
                            # Store other conditions if needed for more complex routing
                    
                    # Fallback or error if no condition met for conditional edges
                    self.logger.warning(f"Router for '{source_id}': No matching condition found for routing. Defaulting to END or error.")
                    # This part needs careful design. If multiple ON_NO_TOOL_CALL point to different places, how to choose?
                    # For now, assumes simple conditions. A more robust router might be needed for complex logic.
                    # A simple default if no other condition matches:
                    if not has_tool_calls: # If it was meant to go somewhere on no tool call, but not explicitly defined above
                        for e in self.workflow_definition['edges']: # Check for a general "next step" if no tools
                             if e['source_node_id'] == source_id and e['condition'].upper() == "ALWAYS_IF_NO_OTHER_CONDITION_MET": # Example
                                return e['target_node_id']
                    return END # Default to END if no route found

                # Create a unique name for the router function if multiple agent nodes have conditional edges
                # This router is specific to source_id
                conditional_map = {}
                for e_data in self.workflow_definition['edges']:
                    if e_data['source_node_id'] == source_id and e_data['condition'].upper() != "ALWAYS":
                        # The key in conditional_map is what router_function returns
                        if e_data['condition'].upper() == "ON_TOOL_CALL":
                            conditional_map["tool_executor"] = "tool_executor" # Standard target for tool calls
                        else: # ON_NO_TOOL_CALL or other custom conditions
                             conditional_map[e_data['target_node_id']] = e_data['target_node_id']


                # Ensure all targets in conditional_map are valid nodes or END
                final_conditional_map = {}
                target_node_for_tool_call = None # Find where ON_TOOL_CALL should go
                target_node_for_no_tool_call = None # Find where ON_NO_TOOL_CALL should go

                for edge in self.workflow_definition['edges']:
                    if edge['source_node_id'] == source_id:
                        if edge['condition'].upper() == "ON_TOOL_CALL":
                            target_node_for_tool_call = edge['target_node_id'] # Should be 'tool_executor'
                        elif edge['condition'].upper() == "ON_NO_TOOL_CALL":
                            target_node_for_no_tool_call = edge['target_node_id']
                
                if target_node_for_tool_call:
                    final_conditional_map['route_tool_call'] = target_node_for_tool_call
                if target_node_for_no_tool_call:
                    final_conditional_map['route_no_tool_call'] = target_node_for_no_tool_call
                
                # Add END as a fallback if necessary, or handle missing routes in router_function
                if not final_conditional_map: # If no conditional edges defined for this source
                    self.logger.warning(f"No conditional edges defined for source '{source_id}'. Consider adding an ALWAYS edge or conditional routes.")
                    continue


                def specific_router(state: AgentState, current_source_id=source_id, tc_target=target_node_for_tool_call, ntc_target=target_node_for_no_tool_call) -> str:
                    # This inner function captures current_source_id, tc_target, ntc_target
                    self.logger.debug(f"Router for '{current_source_id}': Evaluating state.")
                    last_message = state['messages'][-1] if state['messages'] else None
                    has_tool_calls = isinstance(last_message, AIMessage) and bool(last_message.tool_calls)

                    if has_tool_calls and tc_target:
                        self.logger.info(f"Router for '{current_source_id}': Condition ON_TOOL_CALL met. Routing to '{tc_target}'.")
                        return tc_target
                    elif not has_tool_calls and ntc_target:
                        self.logger.info(f"Router for '{current_source_id}': Condition ON_NO_TOOL_CALL met. Routing to '{ntc_target}'.")
                        return ntc_target
                    
                    self.logger.warning(f"Router for '{current_source_id}': No matching conditional route. Defaulting to END.")
                    return END

                self.graph_builder.add_conditional_edges(source_id, specific_router, final_conditional_map)
                self.logger.info(f"Added conditional edges from '{source_id}' with targets: {final_conditional_map}")


        # Compile the graph
        self.runnable_graph = self.graph_builder.compile(checkpointer=self.memory)
        self.logger.info("Workflow graph compiled successfully.")


    def run_workflow(self, initial_input: Dict[str, Any], thread_id: Optional[str] = None) -> Dict[str, Any]:
        if not thread_id:
            thread_id = str(uuid4())
        
        config: RunnableConfig = {"configurable": {"thread_id": thread_id}}
        
        self.logger.info(f"Running workflow '{self.workflow_definition['name']}' for input: '{initial_input.get('task_description', 'N/A')}' with thread_id: {thread_id}")
        
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

            self.logger.info(f"Workflow '{self.workflow_definition['name']}' completed for thread_id: {thread_id}")
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
                "llm_choice": "google",
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
            {"source_node_id": "tool_executor", "target_node_id": "web_research_step", "condition": "ALWAYS"}, # Loop back to researcher
                                                                                                                # This needs refinement: how to know which agent to return to?
                                                                                                                # The current tool_executor doesn't know context.
                                                                                                                # A better way: conditional edges from tool_executor based on state['agent_name']
                                                                                                                # Or, the router for agent nodes must handle the tool_executor output.
                                                                                                                # For simplicity now, let's assume tool_executor always goes back to the agent that called it.
                                                                                                                # This is implicitly handled if the agent node's router is called again.
                                                                                                                # The current LangGraph model: tool_executor -> agent_node (that called tool)

            # From platform_analysis_step
            {"source_node_id": "platform_analysis_step", "target_node_id": "tool_executor", "condition": "ON_TOOL_CALL"},
            {"source_node_id": "platform_analysis_step", "target_node_id": "summarize_step", "condition": "ON_NO_TOOL_CALL"},

            # From summarize_step
            {"source_node_id": "summarize_step", "target_node_id": END, "condition": "ALWAYS"} # Summarizer is the last step
        ],
        "start_node_id": "web_research_step"
    }
    
    # Refined edge logic for tool_executor:
    # The graph should be: agent -> tool_executor -> agent (the one that called the tool)
    # This is implicitly handled by LangGraph if the conditional edge from the agent points to tool_executor,
    # and then an edge from tool_executor points back to the agent.
    # The router for the agent node will then process the ToolMessage.
    # So, the "tool_executor" -> "web_research_step" (ALWAYS) edge is correct if web_research_step is the only one calling tools before platform_analysis_step.
    # Let's simplify the example edges for clarity on dynamic routing:
    # Each agent node will have conditional edges: one for tool call (to tool_executor), one for no tool call (to next logical step or END).
    # The tool_executor will have an edge back to the agent that called the tool. This needs dynamic targetting or multiple tool_executor exit points.
    # LangGraph's standard pattern is that after a tool call, the AIMessage with tool_calls and subsequent ToolMessages are added to state,
    # and the graph routes back to the *same agent node* that initially decided to call the tool.
    # The agent then processes the tool results in its next invocation.
    # So, the router on the agent node itself handles the "after tool execution" logic.

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
