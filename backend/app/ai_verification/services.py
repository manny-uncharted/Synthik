import os
import json
import logging
import operator # For LangGraph message accumulation
import re # For parsing tool calls in Atoma LLM output
from typing import List, Dict, Any, Annotated, Sequence, Optional, Type
from typing_extensions import TypedDict
from pydantic import BaseModel, Field, root_validator
from uuid import uuid4
import base64
import mimetypes
import hashlib
import random
import asyncio
import subprocess


# Attempt to import external libraries and set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)


try:
    from atoma_sdk import AtomaSDK
except ImportError:
    logger.warning("AtomaSDK not found. Atoma LLM functionality will be disabled. pip install atoma-sdk")
    AtomaSDK = None

try:
    from google import genai
    from google.genai import types as google_types # Renamed to avoid conflict
    from langchain_google_genai import ChatGoogleGenerativeAI
    logger.info("Successfully imported Google GenAI libraries.")
except ImportError:
    logger.error("Failed to import Google GenAI libraries (google.genai, langchain_google_genai). Google LLM functionality will be severely limited.")
    genai = None
    ChatGoogleGenerativeAI = None
    google_types = None


try:
    from langchain_core.tools import tool, BaseTool
    from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage, SystemMessage
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import PydanticOutputParser
    from langgraph.graph import StateGraph, END, START
    from tavily import TavilyClient
    from langgraph.checkpoint.memory import MemorySaver
    from langchain_core.runnables import RunnableConfig, Runnable
    
except ImportError:
    logger.error("LangChain core components (tools, messages, prompts, langgraph, tavily) not found. Please install langchain, langgraph, langchain-core, tavily-python.")
    raise

try:
    import PyPDF2
except ImportError:
    logger.warning("PyPDF2 not found. PDF reading will be unavailable in FileContentReaderTool. pip install pypdf2")
    PyPDF2 = None

try:
    import pandas as pd
except ImportError:
    logger.warning("pandas not found. CSV reading will be unavailable in FileContentReaderTool. pip install pandas")
    pd = None

try:
    from docx import Document as DocxDocument # Alias to avoid conflict with other Document types
except ImportError:
    logger.warning("python-docx not found. DOCX reading will be unavailable in FileContentReaderTool. pip install python-docx")
    DocxDocument = None

try:
    from redis.asyncio import Redis as AsyncRedis
    logger.info("Successfully imported redis.asyncio.")
except ImportError:
    logger.warning("redis.asyncio not found. Caching functionality will be disabled. pip install redis")
    AsyncRedis = None


# from app.core.constants import REDIS_URL # Assuming this would be defined elsewhere
# For standalone script:
REDIS_URL_FROM_LOG = "redis://default:GXWXfwdxLCpVnKR6ieV5Wd2EaFU6A2tS@redis-18981.c321.us-east-1-2.ec2.redns.redis-cloud.com:18981"

from app.ai_agents.enterprise_workflow import (
    AtomaLangChainWrapper,
    DataPlatformQueryTool,
    TavilySearchTool,
    
)
from app.ai_verification.utils import LilypadLLMWrapper


# --- Configuration Class ---
class AppConfig:
    ATOMASDK_BEARER_AUTH: Optional[str] = os.getenv("ATOMASDK_BEARER_AUTH")
    GOOGLE_API_KEY: Optional[str] = os.getenv("GEMINI_API_KEY")
    FASTAPI_BASE_URL: Optional[str] = os.getenv("FASTAPI_BASE_URL", "http://localhost:8001")
    DEFAULT_ATOMA_MODEL: str = "Infermatic/Llama-3.3-70B-Instruct-FP8-Dynamic"
    ATOMA_ALT_MODEL_1: str = "deepseek-ai/DeepSeek-V3-0324"
    ATOMA_ALT_MODEL_2: str = "mistralai/Mistral-Nemo-Instruct-2407"
    DEFAULT_GOOGLE_MODEL: str = "gemini-2.5-pro-preview-05-06" # Using a slightly older but stable one
    DEFAULT_GOOGLE_VISION_MODEL: str = "gemini-2.5-pro-preview-05-06"

    TAVILY_API_KEY: Optional[str] = os.getenv("TAVILY_API_KEY")
    REDIS_URL: Optional[str] = REDIS_URL_FROM_LOG # Use from log as default if not in env
    redis_client: Optional[AsyncRedis] = None


    def __init__(self):
        if self.GOOGLE_API_KEY and genai:
            try:
                # genai.configure(api_key=self.GOOGLE_API_KEY) # langchain_google_genai handles this
                logger.info("Google API Key found. Google LLM functionality should be available via LangChain.")
            except Exception as e:
                logger.error(f"Failed to configure Google Generative AI SDK: {e}")
        elif not self.GOOGLE_API_KEY and genai:
             logger.warning("GOOGLE_API_KEY (GEMINI_API_KEY) not found. Google LLM functionality will be limited.")

        if not self.ATOMASDK_BEARER_AUTH and AtomaSDK:
            logger.warning("ATOMASDK_BEARER_AUTH not found. Atoma LLM functionality will be limited.")

        if not self.FASTAPI_BASE_URL:
            logger.warning("FASTAPI_BASE_URL not found. DataPlatformQueryTool may not function as intended.")

        if AsyncRedis and self.REDIS_URL: # Ensure REDIS_URL is also checked
            try:
                # Use from_url for redis.asyncio.Redis
                self.redis_client = AsyncRedis.from_url(
                    self.REDIS_URL,
                    decode_responses=True
                )
                logger.info(f"Redis client configured for {self.REDIS_URL}")
            except Exception as e:
                logger.error(f"Failed to configure Redis client: {e}")
                self.redis_client = None
        elif not self.REDIS_URL and AsyncRedis:
            logger.warning("REDIS_URL not set. Redis client will not be configured.")
            self.redis_client = None
        else:
            logger.warning("Redis (asyncio) not available or REDIS_URL not set, caching will be disabled.")

CONFIG = AppConfig()



# --- Pydantic Models for Verification ---
class ImageSimilarityScore(BaseModel):
    score: float = Field(..., description="Numeric similarity score between 20 and 100.")
    reasoning: Optional[str] = Field(None, description="Brief reasoning for the score.")

class TextEvaluationScore(BaseModel):
    accuracy: float = Field(..., description="Accuracy of the information (20-100).")
    alignment: float = Field(..., description="Alignment with campaign goals (20-100).")
    relevance: float = Field(..., description="Relevance to the topic (20-100).")
    word_count_compliance: float = Field(..., description="Compliance with word count requirements (20-100).")
    grammatical_accuracy: float = Field(..., description="Grammatical accuracy (20-100).")
    semantic_relevance: float = Field(..., description="Semantic relevance to the campaign (20-100).")
    sentiment_diversity: float = Field(..., description="Diversity or appropriateness of sentiment (20-100).")
    reasoning: Optional[str] = Field(None, description="Brief overall reasoning for the scores.")

    @property
    def final_score(self) -> float:
        scores = [
            self.accuracy, self.alignment, self.relevance, self.word_count_compliance,
            self.grammatical_accuracy, self.semantic_relevance, self.sentiment_diversity
        ]
        return sum(scores) / len(scores) if scores else 0.0

class VerificationDecision(BaseModel):
    decision: str = Field(..., description="Decision, either 'ACCEPT' or 'REJECT'.")
    score: float = Field(..., description="The final score that led to the decision.")
    reasoning: Optional[str] = Field(None, description="Reasoning for the decision if applicable.")


# --- Utility Functions from AIVerificationSystem ---
def hash_document_content(content: bytes) -> str:
    hash_sha256 = hashlib.sha256()
    hash_sha256.update(content)
    file_hash = hash_sha256.hexdigest()
    logger.debug(f"Computed content hash: {file_hash}") # Changed to debug to reduce noise
    return file_hash

async def check_cache(redis_client: Optional[AsyncRedis], cache_key: str) -> Optional[str]:
    if not redis_client:
        return None
    try:
        cached_data = await redis_client.get(cache_key)
        if cached_data is not None:
            logger.info(f"Cache hit for key: {cache_key}")
            return cached_data
        logger.info(f"Cache miss for key: {cache_key}")
    except Exception as e:
        logger.error(f"Redis GET error for key {cache_key}: {e}")
    return None

async def store_in_cache(redis_client: Optional[AsyncRedis], cache_key: str, data: str, ttl_seconds: int = 86400):
    if not redis_client:
        return
    try:
        await redis_client.setex(cache_key, ttl_seconds, data)
        logger.info(f"Stored data in cache for key: {cache_key} with TTL {ttl_seconds}s")
    except Exception as e:
        logger.error(f"Redis SETEX error for key {cache_key}: {e}")


def apply_fairness_adjustment(raw_score: float) -> float:
    enhancement_factor = random.uniform(1.0, 1.10)
    smoothing_factor = random.uniform(0.97, 1.03)
    if raw_score < 80:
        adjusted_score = (raw_score * enhancement_factor) / smoothing_factor
    else:
        adjusted_score = raw_score / random.uniform(0.99, 1.01)
    normalized_score = min(max(adjusted_score, 0.0), 100.0) # Ensure lower bound is 0.0
    logger.info(f"Raw score: {raw_score:.2f}, Enhancement: {enhancement_factor:.2f}, Smoothing: {smoothing_factor:.2f}, Adjusted: {adjusted_score:.2f}, Normalized: {normalized_score:.2f}")
    return normalized_score

# --- Input Schemas for Tools ---
class FileContentReaderToolInput(BaseModel):
    file_path: str = Field(..., description="Path to the file to read.")

class ImageVerificationScoreToolInput(BaseModel):
    file_path: str = Field(..., description="Path to the image file.")
    campaign_description: str = Field(..., description="Description of the campaign.")
    campaign_requirements: str = Field(..., description="Requirements for the campaign submissions.")
    wallet_address: str = Field(..., description="Wallet address of the submitter for caching purposes.")

class TextVerificationScoreToolInput(BaseModel):
    content: Optional[str] = Field(None, description="Text content to verify (if provided inline).")
    content_path: Optional[str] = Field(None, description="Path to file containing text content to verify.")
    campaign_description: str = Field(...)
    campaign_requirements: str = Field(...)
    wallet_address: str = Field(...)
    llm_choice: str = Field("google", description="LLM to use for verification ('google' or 'atoma').")

    @root_validator(pre=True) # Pydantic v1 style, use model_validator for Pydantic v2
    def check_content_or_path_provided(cls, values):
        if not values.get('content') and not values.get('content_path'):
            raise ValueError("Either 'content' or 'content_path' must be provided.")
        if values.get('content') and values.get('content_path'):
            # Decide on a precedence or raise error, e.g., prioritize content_path
            logger.warning("Both 'content' and 'content_path' provided; 'content_path' will be used.")
            values['content'] = None # Or raise ValueError
        return values

class VerificationDecisionToolInput(BaseModel):
    verification_score: float = Field(..., description="The verification score received.")
    required_quality_score: float = Field(70.0, description="The minimum score required for acceptance.")

class DataPlatformQueryToolInput(BaseModel):
    entity_type: str = Field(..., description="Type of entity to query.")
    filters: Dict[str, Any] = Field(..., description="Filters to apply to the query.")
    limit: int = Field(10, description="Maximum number of results to return.")

class TavilySearchToolInput(BaseModel):
    query: str = Field(..., description="The search query string.")
    num_results: Optional[int] = Field(3, description="Desired number of search results.")


# --- Custom Tools for Verification ---
class FileContentReaderTool(BaseTool):
    name: str = "read_file_content"
    description: str = "Reads the content of a local file (txt, pdf, csv, doc, docx). Input should be the file path. Returns JSON string with 'type' ('text' or 'image'), 'content' (text content or file_path for image), 'file_path', and 'message'."
    args_schema: Type[BaseModel] = FileContentReaderToolInput

    def _encode_image_to_base64(self, file_path: str) -> str:
        with open(file_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode("utf-8")

    def _extract_text_from_doc(self, file_path: str) -> str:
        logger.info(f"Attempting to extract text from .doc file: {file_path} using antiword.")
        try:
            result = subprocess.run(
                ['antiword', file_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False 
            )
            if result.returncode == 0:
                logger.info(f".doc text extraction successful for {file_path}.")
                return result.stdout
            else:
                logger.error(f"Antiword error for {file_path}: {result.stderr}")
                return f"Error reading .doc file with antiword: {result.stderr}"
        except FileNotFoundError:
            logger.error("Antiword command not found. Please install antiword and ensure it's in the system PATH.")
            return "Error: antiword command not found. Cannot process .doc files."
        except Exception as e:
            logger.error(f"Failed to extract text from .doc file {file_path}: {str(e)}")
            return f"Error extracting text from .doc: {str(e)}"

    def _run(self, file_path: str) -> str:
        output = {"type": None, "content": None, "file_path": file_path, "message": ""}
        try:
            if not os.path.exists(file_path):
                output["message"] = f"Error: File not found at '{file_path}'"
                logger.error(output["message"])
                return json.dumps(output)

            mime_type, _ = mimetypes.guess_type(file_path)
            file_extension = os.path.splitext(file_path)[1].lower()

            if mime_type and mime_type.startswith("image"):
                output["type"] = "image"
                # For vision models, we usually pass the path or bytes directly, not base64 string via tool output,
                # unless the LLM consuming this specifically needs base64.
                # The prompt for FileProcessorAgent asks it to put the file_path into scratchpad for images.
                output["content"] = file_path # Pass the path, consuming agent/tool will handle loading
                output["message"] = f"File is an image: {file_path}. Path provided for vision model."
            elif file_extension == '.pdf' and PyPDF2:
                output["type"] = "text"
                content_acc = ""
                with open(file_path, "rb") as pdf_file:
                    reader = PyPDF2.PdfReader(pdf_file)
                    for page_num, page in enumerate(reader.pages):
                        try:
                            text = page.extract_text()
                            if text:
                                content_acc += text + "\n"
                        except Exception as e_page:
                            logger.warning(f"Error extracting text from page {page_num} of PDF {file_path}: {e_page}")
                output["content"] = content_acc
                output["message"] = f"Successfully read PDF: {file_path}"
            elif file_extension == '.csv' and pd:
                output["type"] = "text"
                df = pd.read_csv(file_path)
                output["content"] = df.to_string(index=False)
                output["message"] = f"Successfully read CSV: {file_path}"
            elif file_extension == '.txt':
                output["type"] = "text"
                with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                    output["content"] = f.read()
                output["message"] = f"Successfully read TXT: {file_path}"
            elif file_extension == '.docx' and DocxDocument:
                output["type"] = "text"
                doc = DocxDocument(file_path)
                output["content"] = "\n".join([para.text for para in doc.paragraphs])
                output["message"] = f"Successfully read DOCX: {file_path}"
            elif file_extension == '.doc':
                output["type"] = "text"
                output["content"] = self._extract_text_from_doc(file_path)
                if "Error" not in output["content"] and "not found" not in output["content"]:
                     output["message"] = f"Successfully attempted to read DOC: {file_path}"
                else:
                     output["message"] = f"Failed to read DOC: {file_path}. Details: {output['content']}" # Keep error in content for agent
            else:
                output["message"] = f"Unsupported file type or missing library for: {file_path} (MIME: {mime_type}, Ext: {file_extension})"
                logger.warning(output["message"])
                # Attempt fallback for unknown text-like files
                try:
                    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                        output["content"] = f.read()
                    output["type"] = "text" # Assume text if readable
                    output["message"] += " - Fallback: read as plain text."
                    logger.info(f"Successfully read {file_path} as plain text (fallback).")
                except Exception as e_fallback:
                    output["message"] += f" - Fallback read as plain text also failed: {e_fallback}"
                    logger.warning(f"Fallback read as plain text failed for {file_path}: {e_fallback}")
                    # If it's not a known type and not readable as text, content remains None

        except Exception as e:
            output["message"] = f"General error reading file '{file_path}': {e}"
            logger.exception(output["message"]) # Log full traceback for unexpected errors
        
        # Ensure content is not None if type is set, otherwise agent might get confused
        if output["type"] and output["content"] is None:
            if output["type"] == "image": # Image type is set, content should be file_path
                 if not os.path.exists(file_path): # Double check existence if type is image but content somehow None
                     output["message"] += " Image file path seems invalid or became unavailable."
                     output["type"] = None # Reset type if content is truly unavailable
            # For text, if content is None after processing, it means reading failed.
            # The message should already reflect this. Agent will see content is None.

        return json.dumps(output)

    async def _arun(self, file_path: str) -> str:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._run, file_path)


class ImageVerificationScoreTool(BaseTool):
    name: str = "get_image_verification_score"
    description: str = (
        "Gets an AI-based similarity score for an image file based on campaign criteria. "
        "Input requires: file_path (string), campaign_description (string), "
        "campaign_requirements (string), and wallet_address (string). "
        "Returns a JSON string of ImageSimilarityScore (score, reasoning)."
    )
    app_config: AppConfig 
    args_schema: Type[BaseModel] = ImageVerificationScoreToolInput

    def __init__(self, **data: Any): 
        super().__init__(**data) 
        if not self.app_config.GOOGLE_API_KEY: 
            logger.warning(f"{self.name}: GOOGLE_API_KEY not found. Image verification will not function effectively.")
        if not ChatGoogleGenerativeAI:
            logger.error(f"{self.name}: ChatGoogleGenerativeAI not available, image verification will fail.")
    
    def _encode_image(self, image_path: str) -> str: # Not directly used if sending bytes/path to LLM
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode("utf-8")

    async def _get_score_from_llm(self, file_path: str, campaign_description: str, campaign_requirements: str) -> ImageSimilarityScore:
        if not self.app_config.GOOGLE_API_KEY or not ChatGoogleGenerativeAI:
            return ImageSimilarityScore(score=0.0, reasoning="Google API key or Langchain Google GenAI not configured.")
        try:
            llm = ChatGoogleGenerativeAI(
                model=self.app_config.DEFAULT_GOOGLE_VISION_MODEL,
                google_api_key=self.app_config.GOOGLE_API_KEY,
                temperature=0.1 # Add for more deterministic scoring if needed
            )
        except Exception as e:
            logger.error(f"Failed to initialize ChatGoogleGenerativeAI for vision: {e}")
            return ImageSimilarityScore(score=0.0, reasoning=f"LLM client initialization error: {e}")
        
        try:
            # Read image bytes
            with open(file_path, "rb") as f:
                image_bytes = f.read()
            
            
            base64_image = base64.b64encode(image_bytes).decode("utf-8")
            mime_type, _ = mimetypes.guess_type(file_path)
            if not mime_type: mime_type = "image/jpeg" # Default MIME type

            image_part = {"type": "image_url", "image_url": f"data:{mime_type};base64,{base64_image}"}
            
            text_part = {
                "type": "text",
                "text": (
                    "You are an expert evaluator. Analyze the provided image based on the campaign details.\n\n"
                    f"Campaign Description: {campaign_description}\n\n"
                    f"Campaign Requirements: {campaign_requirements}\n\n"
                    "Provide a numeric similarity score between 20 and 100 (float) and a brief reasoning (string, max 150 chars). "
                    "Be objective. Focus on how well the image meets the explicit requirements. "
                    "Return ONLY a JSON object with keys 'score' (float) and 'reasoning' (string)."
                )
            }
            prompt_messages = [HumanMessage(content=[text_part, image_part])] # Pass list of parts
            
            logger.info(f"Sending image ({file_path}, size: {len(image_bytes)} bytes) to Gemini Vision model: {self.app_config.DEFAULT_GOOGLE_VISION_MODEL}")
            
            structured_llm = llm.with_structured_output(ImageSimilarityScore)
            ai_response = await structured_llm.ainvoke(prompt_messages)

            if not isinstance(ai_response, ImageSimilarityScore):
                logger.warning(f"Did not get ImageSimilarityScore object directly from vision model, got {type(ai_response)}. Raw: {str(ai_response)[:200]}")
                # Attempt to parse if it's a BaseMessage with JSON content
                content_to_parse = ""
                if hasattr(ai_response, 'content') and isinstance(ai_response.content, str):
                    content_to_parse = ai_response.content
                elif isinstance(ai_response, str): # Sometimes it might be just a string
                    content_to_parse = ai_response
                
                if content_to_parse:
                    try:
                        # Gemini can sometimes wrap JSON in ```json ... ```
                        match = re.search(r"```json\s*(\{.*?\})\s*```", content_to_parse, re.DOTALL)
                        if match:
                            content_to_parse = match.group(1)
                        parsed_json = json.loads(content_to_parse)
                        return ImageSimilarityScore(**parsed_json)
                    except json.JSONDecodeError:
                        logger.error(f"Failed to parse JSON from vision model response: {content_to_parse}")
                        # Try to extract score with regex as a last resort
                        score_match = re.search(r'["\']score["\']\s*:\s*([0-9.]+)', content_to_parse)
                        extracted_score = float(score_match.group(1)) if score_match else 0.0
                        return ImageSimilarityScore(score=extracted_score, reasoning=f"Score extracted via regex, full reasoning unavailable due to parsing error from: {content_to_parse[:100]}")
                return ImageSimilarityScore(score=0.0, reasoning=f"Could not parse score from LLM response: {str(ai_response)[:200]}")
            return ai_response
        except FileNotFoundError:
            logger.error(f"Image file not found at path: {file_path}")
            return ImageSimilarityScore(score=0.0, reasoning=f"File not found: {file_path}")
        except google_types.generation_types.BlockedPromptException as bpe:
            logger.error(f"Image verification blocked by API for safety reasons: {bpe}. Path: {file_path}")
            return ImageSimilarityScore(score=0.0, reasoning=f"Blocked by API safety filters: {bpe}")
        except Exception as e:
            logger.exception(f"Error during image verification with Gemini: {e}. Path: {file_path}")
            return ImageSimilarityScore(score=0.0, reasoning=f"Exception during verification: {e}")

    async def _arun(
        self,
        file_path: str,
        campaign_description: str,
        campaign_requirements: str,
        wallet_address: str,
        llm_choice: str = "google"
    ) -> str:
        if not os.path.exists(file_path):
             logger.error(f"{self.name}: File not found at {file_path} when starting _arun.")
             return json.dumps(ImageSimilarityScore(score=0.0, reasoning=f"File not found: {file_path}").model_dump())
        try:
            with open(file_path, "rb") as f: # Ensure file can be read before hashing for cache key
                file_content_bytes = f.read()
            file_hash = hash_document_content(file_content_bytes) # Hash actual content
            
            # Create a more robust cache key
            cache_key_parts = [
                "img_score_v2", # Version prefix
                wallet_address,
                file_hash,
                hashlib.sha1(campaign_description.encode()).hexdigest()[:16], # Hash long strings
                hashlib.sha1(campaign_requirements.encode()).hexdigest()[:16]
            ]
            cache_key = ":".join(cache_key_parts)

            cached_score_json = await check_cache(self.app_config.redis_client, cache_key)
            if cached_score_json:
                try:
                    cached_data = json.loads(cached_score_json)
                    # Validate cached data structure (e.g., contains 'score')
                    if 'score' in cached_data and 'reasoning' in cached_data:
                         logger.info(f"Using cached image score for {file_path}")
                         return json.dumps(cached_data) # Return full cached model
                    else:
                        logger.warning(f"Cached image score data for {cache_key} is malformed. Re-fetching.")
                except json.JSONDecodeError:
                    logger.warning(f"Failed to parse cached JSON for {cache_key}: {cached_score_json}. Re-fetching.")

            raw_score_model = await self._get_score_from_llm(file_path, campaign_description, campaign_requirements)
            adjusted_numeric_score = apply_fairness_adjustment(raw_score_model.score)
            
            final_score_model = ImageSimilarityScore(
                score=round(adjusted_numeric_score, 2),
                reasoning=(raw_score_model.reasoning or "No specific reasoning provided by LLM.") + f" (Original score: {raw_score_model.score:.2f}. Adjusted from fairness application.)"
            )
            await store_in_cache(self.app_config.redis_client, cache_key, final_score_model.model_dump_json())
            return final_score_model.model_dump_json()
        except Exception as e: 
            logger.exception(f"Outer error in _arun for ImageVerificationScoreTool ({file_path}): {e}")
            # Return a valid JSON string representing an error score model
            return json.dumps(ImageSimilarityScore(score=0.0, reasoning=f"Tool execution error: {e}").model_dump())

    def _run(self, file_path: str, campaign_description: str, campaign_requirements: str, wallet_address: str) -> str:
        # This sync wrapper is okay for BaseTool, Langchain handles the event loop if called from sync context.
        return asyncio.run(self._arun(file_path, campaign_description, campaign_requirements, wallet_address))


class TextVerificationScoreTool(BaseTool):
    name: str = "get_text_verification_score"
    description: str = (
        "Gets AI-based quality and alignment scores for a given text content against campaign criteria. "
        "Input requires: content (string), campaign_description (string), "
        "campaign_requirements (string), wallet_address (string), and llm_choice (string, 'google' or 'atoma'). "
        "Returns a JSON string of TextEvaluationScore including 'final_score_adjusted'."
    )
    app_config: AppConfig
    args_schema: Type[BaseModel] = TextVerificationScoreToolInput

    def __init__(self, **data: Any): 
        super().__init__(**data)
        # No specific post-init needed here as _get_llm_provider handles checks

    def _get_llm_provider(self, choice: str) -> Runnable:
        if choice.lower() == "google" and ChatGoogleGenerativeAI and self.app_config.GOOGLE_API_KEY:
            return ChatGoogleGenerativeAI(
                model=self.app_config.DEFAULT_GOOGLE_MODEL,
                google_api_key=self.app_config.GOOGLE_API_KEY,
                convert_system_message_to_human=True, # Some models work better with this
                temperature=0.1 # For more deterministic scoring
            )
        elif choice.lower() == "atoma" and AtomaSDK and self.app_config.ATOMASDK_BEARER_AUTH and AtomaLangChainWrapper:
            return AtomaLangChainWrapper(
                model_name=self.app_config.DEFAULT_ATOMA_MODEL,
                api_key=self.app_config.ATOMASDK_BEARER_AUTH
            )
        else:
            logger.warning(f"{self.name}: LLM choice '{choice}' not available/configured. Using a fallback echo that returns minimal scores.")
            # Fallback LLM that produces a valid TextEvaluationScore structure with low scores
            class EchoLLM(Runnable):
                def __init__(self):
                    self.logger = logging.getLogger(f"{__name__}.EchoLLM")
                def invoke(self, i, c=None): 
                    self.logger.info("EchoLLM: invoke called.")
                    return TextEvaluationScore(accuracy=20, alignment=20, relevance=20, word_count_compliance=20, grammatical_accuracy=20, semantic_relevance=20, sentiment_diversity=20, reasoning="EchoLLM fallback: Real LLM not available.")
                async def ainvoke(self, i, c=None): return self.invoke(i,c)
                def with_structured_output(self, schema, **kwargs): return self # Pass through for structured output
            return EchoLLM()

    def _format_error_output(self, score_model: TextEvaluationScore, log_message: str) -> str:
        logger.error(log_message + f" Reasoning: {score_model.reasoning}")
        output_data = score_model.model_dump()
        output_data['final_score_adjusted'] = apply_fairness_adjustment(score_model.final_score)
        return json.dumps(output_data)

    async def _get_scores_from_llm(self, content: str, campaign_description: str, campaign_requirements: str, llm_choice: str) -> TextEvaluationScore:
        llm = self._get_llm_provider(llm_choice)
        
        # Define the Pydantic model for structured output
        # schema_pydantic = TextEvaluationScore # Already defined

        prompt = ChatPromptTemplate.from_messages([
            ("system",
             "You are an expert evaluator. Evaluate the submitted content based on the campaign details. "
             "Score each criterion: Accuracy, Alignment, Relevance, Word Count Compliance, Grammatical Accuracy, Semantic Relevance, and Sentiment Diversity from 20 to 100 (float for each). "
             "Also provide a brief overall 'reasoning' (string, max 150 chars) for your scores. Be objective. "
             "Return ONLY a JSON object matching this structure: "
             "{{\"accuracy\": float, \"alignment\": float, \"relevance\": float, \"word_count_compliance\": float, "
             "\"grammatical_accuracy\": float, \"semantic_relevance\": float, \"sentiment_diversity\": float, \"reasoning\": \"string\"}}."
            ),
            ("human",
             "Campaign Description:\n{campaign_description}\n\n"
             "Campaign Requirements:\n{campaign_requirements}\n\n"
             "Submitted Content:\n{content}\n\n"
             "Ensure your response is ONLY the specified JSON object." # Re-iterate for models prone to verbosity
            )
        ])
        
        # Use with_structured_output for Pydantic model
        chain = prompt | llm.with_structured_output(TextEvaluationScore)
        
        try:
            logger.info(f"Sending text content (len: {len(content)}) to LLM ({llm_choice}) for evaluation.")
            
            # AtomaLangChainWrapper might not have `ainvoke` if not implemented, or if it's not a true LCEL Runnable.
            # Assuming it's compatible or will be run in executor if needed.
            # The provided AtomaLangChainWrapper seems to implement invoke and ainvoke.
            response_model = await chain.ainvoke({
                "campaign_description": campaign_description,
                "campaign_requirements": campaign_requirements,
                "content": content,
            })

            if not isinstance(response_model, TextEvaluationScore):
                logger.warning(f"Did not get TextEvaluationScore object directly from {llm_choice}, got {type(response_model)}. Raw: {str(response_model)[:200]}")
                # Attempt to parse if it's a BaseMessage with JSON content
                content_to_parse = ""
                if hasattr(response_model, 'content') and isinstance(response_model.content, str):
                    content_to_parse = response_model.content
                elif isinstance(response_model, str):
                     content_to_parse = response_model

                if content_to_parse:
                    try:
                        # LLMs can sometimes wrap JSON in ```json ... ```
                        match = re.search(r"```json\s*(\{.*?\})\s*```", content_to_parse, re.DOTALL)
                        if match:
                            content_to_parse = match.group(1)
                        parsed_json = json.loads(content_to_parse)
                        return TextEvaluationScore(**parsed_json)
                    except json.JSONDecodeError as json_e:
                        logger.error(f"Failed to parse JSON from {llm_choice} model response: {content_to_parse}. Error: {json_e}")
                        return TextEvaluationScore(accuracy=20, alignment=20, relevance=20, word_count_compliance=20, grammatical_accuracy=20, semantic_relevance=20, sentiment_diversity=20, reasoning=f"LLM output parsing error from {llm_choice}: {content_to_parse[:100]}")
                return TextEvaluationScore(accuracy=20, alignment=20, relevance=20, word_count_compliance=20, grammatical_accuracy=20, semantic_relevance=20, sentiment_diversity=20, reasoning=f"Could not parse score from {llm_choice} LLM response: {str(response_model)[:200]}")
            return response_model
        except google_types.generation_types.BlockedPromptException as bpe:
            logger.error(f"Text verification blocked by API for safety reasons ({llm_choice}): {bpe}. Content snippet: {content[:100]}")
            return TextEvaluationScore(accuracy=0, alignment=0, relevance=0, word_count_compliance=0, grammatical_accuracy=0, semantic_relevance=0, sentiment_diversity=0, reasoning=f"Blocked by API safety filters: {bpe}")
        except Exception as e:
            logger.exception(f"Error during text verification with {llm_choice}: {e}. Content snippet: {content[:100]}")
            return TextEvaluationScore(accuracy=20, alignment=20, relevance=20, word_count_compliance=20, grammatical_accuracy=20, semantic_relevance=20, sentiment_diversity=20, reasoning=f"Exception during text verification with {llm_choice}: {e}")

    async def _arun(
        self,
        campaign_description: str,
        campaign_requirements: str,
        wallet_address: str,
        content: Optional[str] = None,
        content_path: Optional[str] = None,
        llm_choice: str = "google"
    ) -> str:
        actual_text_to_evaluate: str
        source_description_for_cache = ""

        if content_path:
            logger.info(f"Reading text content from path: {content_path}")
            source_description_for_cache = f"path_{os.path.basename(content_path)}"
            try:
                if not os.path.exists(content_path):
                    # Return a JSON error string compatible with TextEvaluationScore
                    err_score = TextEvaluationScore(..., reasoning=f"Error: Content file path not found: {content_path}")
                    return self._format_error_output(err_score, "File not found during text scoring.")
                with open(content_path, "r", encoding="utf-8", errors="replace") as f:
                    actual_text_to_evaluate = f.read()
                # Optional: Clean up the temporary file if you know it was created by FileContentReaderTool
                # and won't be needed again. This needs careful lifecycle management.
                # For example, if content_path is in a specific temp dir:
                # if "/path/to/my/managed_temp_dir/" in content_path:
                #     try:
                #         os.remove(content_path)
                #         logger.info(f"Cleaned up temporary text file: {content_path}")
                #     except OSError as e:
                #         logger.warning(f"Could not clean up temp file {content_path}: {e}")

            except Exception as e:
                logger.error(f"Error reading content from path {content_path}: {e}")
                err_score = TextEvaluationScore(..., reasoning=f"Error reading content from path: {e}")
                return self._format_error_output(err_score, "Error reading content file during text scoring.")

        elif content:
            logger.info("Using inline text content.")
            source_description_for_cache = "inline_content"
            actual_text_to_evaluate = content
        else:
            # This should be caught by Pydantic validator, but as a fallback:
            err_score = TextEvaluationScore(..., reasoning="Tool Error: No content provided for text verification.")
            return self._format_error_output(err_score, "No content provided.")
        try:
            content_hash = hash_document_content(actual_text_to_evaluate.encode('utf-8'))
            # Create a more robust cache key
            cache_key_parts = [
                "txt_score_v3", # Version prefix
                wallet_address,
                content_hash,
                hashlib.sha1(campaign_description.encode()).hexdigest()[:16],
                hashlib.sha1(campaign_requirements.encode()).hexdigest()[:16],
                llm_choice
            ]
            cache_key = ":".join(cache_key_parts)

            cached_score_json = await check_cache(self.app_config.redis_client, cache_key)
            if cached_score_json:
                try:
                    cached_data = json.loads(cached_score_json)
                    # Validate cached data structure
                    if all(k in cached_data for k in ['accuracy', 'final_score_adjusted', 'reasoning']):
                        logger.info(f"Using cached text score for content hash {content_hash[:10]}...")
                        return json.dumps(cached_data)
                    else:
                        logger.warning(f"Cached text score data for {cache_key} is malformed. Re-fetching.")
                except json.JSONDecodeError:
                    logger.warning(f"Failed to parse cached JSON for {cache_key}: {cached_score_json}. Re-fetching.")

            raw_eval_model = await self._get_scores_from_llm(actual_text_to_evaluate, campaign_description, campaign_requirements, llm_choice)
            adjusted_final_score_val = apply_fairness_adjustment(raw_eval_model.final_score)
            
            final_reasoning = (raw_eval_model.reasoning or f"No specific reasoning from {llm_choice} LLM.")
            final_reasoning += f" (Original avg score: {raw_eval_model.final_score:.2f}. Final adjusted: {adjusted_final_score_val:.2f})"
            
            output_data = raw_eval_model.model_dump()
            output_data['final_score_adjusted'] = round(adjusted_final_score_val, 2)
            output_data['reasoning'] = final_reasoning
            
            await store_in_cache(self.app_config.redis_client, cache_key, json.dumps(output_data))
            return json.dumps(output_data)
        except Exception as e: 
            logger.exception(f"Outer error in _arun for TextVerificationScoreTool: {e}")
            # Return a valid JSON string representing an error score model
            error_eval_model = TextEvaluationScore(accuracy=20, alignment=20, relevance=20, word_count_compliance=20, grammatical_accuracy=20, semantic_relevance=20, sentiment_diversity=20, reasoning=f"Tool execution error: {e}")
            output_data = error_eval_model.model_dump()
            output_data['final_score_adjusted'] = apply_fairness_adjustment(error_eval_model.final_score) # Apply to default low score
            return json.dumps(output_data)

    def _run(self, content: str, campaign_description: str, campaign_requirements: str, wallet_address: str, llm_choice: str = "google") -> str:
        return asyncio.run(self._arun(content, campaign_description, campaign_requirements, wallet_address, llm_choice))


class VerificationDecisionTool(BaseTool):
    name: str = "make_verification_decision"
    description: str = (
        "Makes a final 'ACCEPT' or 'REJECT' decision based on a verification score and a required quality score. "
        "Input requires: verification_score (float), required_quality_score (float, defaults to 70.0). "
        "Returns a JSON string of VerificationDecision (decision, score, reasoning)."
    )
    args_schema: Type[BaseModel] = VerificationDecisionToolInput
    
    def _run(self, verification_score: float, required_quality_score: float = 70.0) -> str:
        # Ensure scores are valid numbers, handle potential string inputs if LLM messes up
        try:
            v_score = float(verification_score)
            req_score = float(required_quality_score)
        except (ValueError, TypeError) as e:
            logger.error(f"Invalid score types for VerificationDecisionTool: verification_score='{verification_score}', required_quality_score='{required_quality_score}'. Error: {e}")
            # Default to reject if scores are invalid
            v_score = 0.0 
            req_score = 70.0 # Default requirement
            error_reasoning = f"Invalid score inputs. Defaulting to reject. Error: {e}."
            decision_model = VerificationDecision(
                score=v_score,
                decision="REJECT",
                reasoning=f"Score {v_score:.2f} vs threshold {req_score:.2f}. {error_reasoning}"
            )
            return decision_model.model_dump_json()


        decision_model = VerificationDecision(
            score=round(v_score,2),
            decision="ACCEPT" if v_score >= req_score else "REJECT",
            reasoning=f"Score {v_score:.2f} {'accepted' if v_score >= req_score else 'rejected'} against threshold {req_score:.2f}."
        )
        logger.info(f"Verification decision: {decision_model.decision} for score {v_score:.2f} (required: {req_score:.2f})")
        return decision_model.model_dump_json()

    async def _arun(self, verification_score: float, required_quality_score: float = 70.0) -> str:
        # This tool is simple and CPU-bound, so async wrapper is mainly for consistency.
        return self._run(verification_score, required_quality_score)


class ToolRegistry:
    def __init__(self, app_config: AppConfig):
        self.tools: Dict[str, BaseTool] = {}
        self.app_config = app_config
        self.logger = logging.getLogger(f"{__name__}.ToolRegistry")
        self._register_default_tools()

    def _register_default_tools(self):
        if self.app_config.TAVILY_API_KEY and TavilySearchTool:
            try:
                # TavilySearchTool might take max_results or other args in constructor if customized
                self.add_tool(TavilySearchTool(tavily_api_key=self.app_config.TAVILY_API_KEY))
            except Exception as e:
                self.logger.error(f"Failed to register TavilySearchTool: {e}")
        else:
            self.logger.warning("TAVILY_API_KEY not found or TavilySearchTool not available. TavilySearchTool will not be registered.")

        if DataPlatformQueryTool:
            self.add_tool(DataPlatformQueryTool(base_url=self.app_config.FASTAPI_BASE_URL))
        else:
            self.logger.warning("DataPlatformQueryTool not available. Will not be registered.")
        
        self.add_tool(FileContentReaderTool()) # No app_config needed in constructor
        self.add_tool(ImageVerificationScoreTool(app_config=self.app_config))
        self.add_tool(TextVerificationScoreTool(app_config=self.app_config))
        self.add_tool(VerificationDecisionTool()) # No app_config needed in constructor

    def add_tool(self, tool_instance: BaseTool):
        if not tool_instance.name:
            raise ValueError("Tool must have a name.")
        self.tools[tool_instance.name] = tool_instance
        self.logger.info(f"Registered tool: {tool_instance.name}")

    def get_tool(self, name: str) -> Optional[BaseTool]:
        tool = self.tools.get(name)
        if not tool:
            self.logger.warning(f"Tool '{name}' not found in registry.")
        return tool

    def get_tools_by_names(self, names: List[str]) -> List[BaseTool]:
        found_tools = []
        for name in names:
            tool = self.get_tool(name)
            if tool:
                found_tools.append(tool)
            else:
                self.logger.warning(f"Tool '{name}' requested by an agent but not found in registry.")
        return found_tools


# --- LangGraph Agent State ---
class AgentState(TypedDict): 
    messages: Annotated[List[BaseMessage], operator.add]
    agent_name: str # Tracks the last agent that acted
    workflow_scratchpad: Dict[str, Any] # For inter-agent data passing
    current_task_description: Optional[str]


# --- Agent Node Logic ---
class AgentNode:
    def __init__(self, llm_provider: Any, system_message_template: str, tools: List[BaseTool], agent_config_name: str, node_id: str):
        self.llm_provider = llm_provider
        self.system_message_template = system_message_template
        self.tools = tools
        self.agent_config_name = agent_config_name # For logging and identification
        self.node_id = node_id # ID of the node in the graph this agent instance serves
        self.logger = logging.getLogger(f"{__name__}.AgentNode.{self.agent_config_name}") 

        if hasattr(llm_provider, 'bind_tools') and tools and not isinstance(llm_provider, AtomaLangChainWrapper):
            # Standard LangChain way to bind tools for models that support function calling
            self.llm_with_tools = self.llm_provider.bind_tools(tools)
            self.logger.info(f"Tools bound to LLM for agent '{agent_config_name}' (Node: {node_id}). Count: {len(tools)}")
        else:
            self.llm_with_tools = llm_provider # Use as is
            if isinstance(llm_provider, AtomaLangChainWrapper) and tools:
                 llm_provider.bind_tools(tools) # Custom binding for Atoma wrapper
                 self.logger.info(f"Tools passed to AtomaLangChainWrapper for agent '{agent_config_name}' (Node: {node_id}). Count: {len(tools)}")
            elif tools:
                 self.logger.info(f"LLM for agent '{agent_config_name}' (Node: {node_id}) does not use bind_tools or is Atoma. Tools provided: {len(tools)}. Ensure prompting handles tool use.")
            else:
                 self.logger.info(f"No tools provided or bound for agent '{agent_config_name}' (Node: {node_id}).")


    def invoke(self, state: AgentState, config: Optional[RunnableConfig] = None) -> AgentState: # LangGraph expects sync or async method
        self.logger.info(f"Invoked for task: {state.get('current_task_description', 'N/A')}. Agent: {self.agent_config_name}, Node: {self.node_id}")
        
        current_messages = state['messages']
        updated_scratchpad = state.get('workflow_scratchpad', {}).copy() 

        formatting_context = {**updated_scratchpad, "agent_name": self.agent_config_name, "node_id": self.node_id}
        self.logger.debug(f"Agent {self.agent_config_name} (Node {self.node_id}) invoked. Current scratchpad keys for prompt: {list(formatting_context.keys())}")
        if current_messages:
            self.logger.debug(f"Last message agent {self.agent_config_name} sees: type={current_messages[-1].type}, content='{str(current_messages[-1].content)[:100]}...'")
            if isinstance(current_messages[-1], ToolMessage):
                 self.logger.debug(f"  ToolMessage content: {current_messages[-1].content}")

        try:
            system_message_content = self.system_message_template.format(**formatting_context)
        except KeyError as e:
            self.logger.error(f"Missing key for system_message_template of {self.agent_config_name} (Node: {self.node_id}): {e}. Available keys: {list(formatting_context.keys())}")
            error_json_for_llm = {
                "thought": f"Critical error: Required key '{e}' was missing from the scratchpad. I cannot perform my intended task.",
                "scratchpad_updates": {
                    f"{self.node_id}_route_to": "VERIFICATION_HALTED", # Or a specific error route
                    "error_details": f"Agent {self.agent_config_name} (Node {self.node_id}) failed: Missing key '{e}' in scratchpad. Available: {list(formatting_context.keys())}"
                }
            }
            system_message_content = (
                f"URGENT: A system error occurred. A required piece of information ('{e}') is missing. "
                f"Your ONLY action is to output the following JSON object in your response content, and nothing else: \n"
                f"```json\n{json.dumps(error_json_for_llm)}\n```"
            )
        
        constructed_prompt_messages: List[BaseMessage] = [SystemMessage(content=system_message_content)]
        # Filter out any previous system messages from the history if they got there by mistake.
        # Keep Human, AI, Tool messages.
        for msg in current_messages:
            if msg.type not in ("system"): # Ensures we don't duplicate system messages from state
                constructed_prompt_messages.append(msg)
        
        self.logger.debug(f"Agent '{self.agent_config_name}' (Node: {self.node_id}) invoking LLM. Message count: {len(constructed_prompt_messages)}.")
        
        ai_response: AIMessage
        try:
            if hasattr(self.llm_with_tools, 'invoke'):
                ai_response = self.llm_with_tools.invoke(constructed_prompt_messages, config=config)
            else: 
                self.logger.error(f"LLM provider for {self.agent_config_name} (Node: {self.node_id}) is not invokable.")
                error_content = json.dumps({
                    "thought": "Critical error: LLM provider not invokable.",
                    "scratchpad_updates": {
                        f"{self.node_id}_route_to": "VERIFICATION_HALTED", # Use node_id for specific routing signal
                        "invocation_error": "LLM provider not invokable"
                    }
                })
                ai_response = AIMessage(content=error_content, id=str(uuid4()))
        except Exception as e:
            self.logger.exception(f"LLM invocation failed for agent {self.agent_config_name} (Node: {self.node_id}): {e}")
            error_content = json.dumps({
                "thought": f"Critical error during LLM call: {str(e)[:100]}",
                "scratchpad_updates": {
                    f"{self.node_id}_route_to": "VERIFICATION_HALTED", # Use node_id for specific routing signal
                    "invocation_error": str(e)[:150]
                }
            })
            ai_response = AIMessage(content=error_content, id=str(uuid4()))

        self.logger.info(f"LLM Raw Response from '{self.agent_config_name}' (Node: {self.node_id}): '{str(ai_response.content)[:500]}'") # Log more of the response

        if ai_response.tool_calls: 
            self.logger.info(f"Detected tool calls for '{self.agent_config_name}' (Node: {self.node_id}): {ai_response.tool_calls}")
            # *** ADDED LINE: Store which agent node is calling the tools ***
            updated_scratchpad['invoking_agent_for_tools'] = self.node_id 
            self.logger.info(f"Set 'invoking_agent_for_tools' to '{self.node_id}' in scratchpad for tool_executor to route back.")
        else: 
            self.logger.info(f"No tool calls from '{self.agent_config_name}' (Node: {self.node_id}). Attempting to parse content for scratchpad updates.")
            if ai_response.content and isinstance(ai_response.content, str):
                raw_content_from_llm = ai_response.content
                try:
                    content_to_parse = ai_response.content
                    match = re.search(r"```json\s*(\{.*?\})\s*```", content_to_parse, re.DOTALL)
                    if match:
                        self.logger.debug(f"Stripped markdown JSON fence for agent '{self.agent_config_name}' (Node: {self.node_id})")
                        content_to_parse = match.group(1)
                    
                    parsed_content = json.loads(content_to_parse)
                    if isinstance(parsed_content, dict):
                        updates = parsed_content.get("scratchpad_updates")
                        if isinstance(updates, dict):
                            updated_scratchpad.update(updates)
                            self.logger.info(f"Agent '{self.agent_config_name}' (Node: {self.node_id}) successfully updated scratchpad with: {updates}")
                        # It's possible the agent directly returns the scratchpad updates without the "scratchpad_updates" key if it's just JSON.
                        # The prompt asks for "scratchpad_updates", so this should be the primary check.
                        # Consider if the entire response *is* the scratchpad update.
                        elif all(isinstance(k, str) for k in parsed_content.keys()): # Check if it looks like a flat dict of updates
                             # This is a less safe assumption, agent should ideally use "scratchpad_updates"
                            # self.logger.info(f"Agent '{self.agent_config_name}' response is a flat dict, treating as direct scratchpad updates: {parsed_content}")
                            # updated_scratchpad.update(parsed_content)
                            pass # Stick to explicit "scratchpad_updates" as per prompt.

                        # Check if the agent tried to set its routing signal directly (as per prompt)
                        # Example: {"file_processing_step_route_to": "IMAGE_READY_FOR_SCORING", ...}
                        # This is handled by the prompt asking to put it inside "scratchpad_updates".
                        # If it's outside, it will be caught if the whole content is treated as updates, but less reliable.

                    else:
                        self.logger.warning(f"Agent '{self.agent_config_name}' (Node: {self.node_id}) parsed content is not a dict. Parsed: {parsed_content}")
                except json.JSONDecodeError:
                    self.logger.warning(f"Agent '{self.agent_config_name}' (Node: {self.node_id}) response content was not valid JSON. Content: '{ai_response.content[:300]}...'")
                except Exception as e: 
                    self.logger.error(f"Error processing AI response content for scratchpad updates in agent '{self.agent_config_name}' (Node: {self.node_id}): {e}. Content: '{ai_response.content[:300]}...'")
            else:
                self.logger.warning(f"Agent '{self.agent_config_name}' (Node: {self.node_id}) response content is empty or not a string, cannot parse for scratchpad updates.")


        return {
            "messages": [ai_response], 
            "agent_name": self.agent_config_name, 
            "workflow_scratchpad": updated_scratchpad, 
            "current_task_description": state.get("current_task_description")
        }


# --- Tool Execution Node ---
def tool_executor_node_factory(tool_registry: ToolRegistry):
    node_logger = logging.getLogger(f"{__name__}.ToolExecutorNode")
    async def tool_executor_node(state: AgentState) -> Dict[str, Any]: 
        node_logger.info("ToolExecutorNode Invoked.")
        messages = state.get('messages', [])
        last_message = messages[-1] if messages else None
        tool_messages: List[ToolMessage] = []

        if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
            node_logger.info("No tool calls found in the last AI message or no messages exist.")
            # Return empty tool messages, agent_name to show tool executor ran (for clarity in logs)
            return {"messages": [], "agent_name": "ToolExecutor", "workflow_scratchpad": state.get("workflow_scratchpad", {}), "current_task_description": state.get("current_task_description")}

        node_logger.info(f"Executing tool calls: {last_message.tool_calls}")
        for tool_call in last_message.tool_calls:
            tool_name = tool_call.get("name")
            tool_args = tool_call.get("args", {}) # Should be a dict
            tool_id = tool_call.get("id", str(uuid4())) # Ensure a tool_call_id

            if not tool_name:
                error_msg = f"Error: Tool call missing 'name'. Call details: {tool_call}"
                node_logger.error(error_msg)
                tool_messages.append(ToolMessage(content=error_msg, tool_call_id=tool_id, name="unknown_tool_error"))
                continue

            selected_tool = tool_registry.get_tool(tool_name)
            if not selected_tool:
                error_msg = f"Error: Tool '{tool_name}' not found in registry."
                node_logger.error(error_msg)
                tool_messages.append(ToolMessage(content=error_msg, tool_call_id=tool_id, name=tool_name))
                continue
            
            try:
                node_logger.info(f"Executing tool '{tool_name}' with args: {tool_args} (Call ID: {tool_id})")
                if not isinstance(tool_args, dict):
                    node_logger.warning(f"Tool args for '{tool_name}' is not a dict: {tool_args}. Tool execution might fail if schema expects kwargs.")
                    # Attempt to proceed, Pydantic in BaseTool.ainvoke will validate.
                
                # Tools should have an async method _arun for ainvoke to work properly.
                observation = await selected_tool.ainvoke(tool_args) # Pass args as a dictionary for Pydantic validation

                node_logger.info(f"Tool '{tool_name}' (Call ID: {tool_id}) output snippet: {str(observation)[:200]}...")
                # Ensure content is string, as expected by ToolMessage
                tool_messages.append(ToolMessage(content=str(observation), tool_call_id=tool_id, name=tool_name))
            except Exception as e:
                error_msg = f"Error executing tool '{tool_name}' (Call ID: {tool_id}): {e}"
                node_logger.exception(error_msg) # Log full traceback
                tool_messages.append(ToolMessage(content=error_msg, tool_call_id=tool_id, name=tool_name))
        
        return {"messages": tool_messages, "agent_name": "ToolExecutor", "workflow_scratchpad": state.get("workflow_scratchpad", {}), "current_task_description": state.get("current_task_description")}
    return tool_executor_node


# --- Workflow Definition Data Structures --- (Assuming these are simplified, complex workflows might use a class)
class AgentConfigData(BaseModel): # Used for defining agent properties
    name: str = Field(..., min_length=1)
    system_message_template: str
    llm_choice: str # e.g., "google", "atoma"
    allowed_tools: List[str] = Field(default_factory=list)

class WorkflowNodeData(BaseModel): # Defines a node in the graph
    id: str # Unique ID for this node in the graph
    agent_config_name: str # Which agent configuration to use for this node


# --- Graph Definition and Workflow Management ---
class EnterpriseWorkflowManager:
    def __init__(self, workflow_dict: Dict[str, Any], app_config: AppConfig, persistence_db: Optional[str] = None):
        self.workflow_definition_dict = workflow_dict
        self.workflow_name = workflow_dict.get("name", "UnnamedWorkflow")
        self.app_config = app_config
        self.tool_registry = ToolRegistry(app_config=self.app_config)
        self.graph_builder = StateGraph(AgentState)
        self.memory = MemorySaver() if persistence_db else None # Checkpointer
        self.agent_nodes_instances: Dict[str, AgentNode] = {} # Stores instantiated AgentNode objects by their graph node_id
        self.logger = logging.getLogger(f"{__name__}.EnterpriseWorkflowManager.{self.workflow_name}")
        self._compile_workflow()

    def _get_llm_provider(self, choice: str, for_vision: bool = False) -> Runnable:
        # Simplified: In a real scenario, this would involve more sophisticated selection
        model_name = self.app_config.DEFAULT_GOOGLE_MODEL
        if for_vision:
            model_name = self.app_config.DEFAULT_GOOGLE_VISION_MODEL
            self.logger.info(f"Getting LLM for vision: Google model {model_name}")
            if ChatGoogleGenerativeAI and self.app_config.GOOGLE_API_KEY:
                return ChatGoogleGenerativeAI(model=model_name, google_api_key=self.app_config.GOOGLE_API_KEY)
        elif choice.lower() == "google":
            self.logger.info(f"Getting LLM: Google model {model_name}")
            if ChatGoogleGenerativeAI and self.app_config.GOOGLE_API_KEY:
                # convert_system_message_to_human can be useful for some models if they don't handle SystemMessage well
                return ChatGoogleGenerativeAI(model=model_name, google_api_key=self.app_config.GOOGLE_API_KEY, convert_system_message_to_human=False)
        elif choice.lower() == "atoma":
            model_name = self.app_config.DEFAULT_ATOMA_MODEL
            self.logger.info(f"Getting LLM: Atoma model {model_name}")
            if AtomaSDK and self.app_config.ATOMASDK_BEARER_AUTH and AtomaLangChainWrapper:
                return AtomaLangChainWrapper(model_name=model_name, api_key=self.app_config.ATOMASDK_BEARER_AUTH)

        elif choice.lower() == "lilypad":
            model_name = self.app_config.DEFAULT_LILYPAD_MODEL
            self.logger.info(f"Getting LLM: Lilypad model {model_name}")
            if LilypadLLMWrapper and self.app_config.LILYPAD_API_KEY:
                return LilypadLLMWrapper(model_name=model_name, api_key=self.app_config.LILYPAD_API_KEY)

        self.logger.warning(f"LLM provider for choice '{choice}' (vision: {for_vision}) not available/configured. Falling back to a simple EchoLLM.")
        class EchoLLM(Runnable): # Basic fallback
            def __init__(self):
                self.logger = logging.getLogger(f"{__name__}.EchoLLM")
            def invoke(self, i, c=None):
                input_summary = str(i[-1].content if isinstance(i, list) and i and hasattr(i[-1], 'content') else i)[:50]
                self.logger.info(f"EchoLLM: invoke called. Input: ...{input_summary}")
                return AIMessage(content=f"EchoLLM: No real LLM. Input: ...{input_summary}", id=str(uuid4()))
            async def ainvoke(self, i, c=None): return self.invoke(i,c) # So it can be awaited
            def bind_tools(self, tools): self.logger.info("EchoLLM: bind_tools called."); return self
            def with_structured_output(self, schema, **kwargs): self.logger.info("EchoLLM: with_structured_output called."); return self
        return EchoLLM()

    def _compile_workflow(self):
        self.logger.info(f"Compiling workflow: {self.workflow_name}")
        
        # Parse workflow structure from dict
        agent_configs_list = [AgentConfigData(**ac) for ac in self.workflow_definition_dict.get("agent_configs", [])]
        nodes_list = [WorkflowNodeData(**nd) for nd in self.workflow_definition_dict.get("nodes", [])]
        # Edges are more complex, handled by conditional_edge_maps and direct edges
        conditional_edge_maps = self.workflow_definition_dict.get("conditional_edge_maps", {})
        start_node_id = self.workflow_definition_dict.get("start_node_id")
        
        if not start_node_id:
            raise ValueError(f"Workflow '{self.workflow_name}' definition must have a 'start_node_id'.")

        agent_configs_map = {ac.name: ac for ac in agent_configs_list}

        # --- CORRECTED ROUTER FUNCTION ---
        def create_router_function(source_node_id_for_router: str, current_node_conditional_map: Dict[str, str]):
            router_logger = logging.getLogger(f"{self.logger.name}.Router.{source_node_id_for_router}")
            def router_function(state: AgentState) -> str: 
                router_logger.debug(f"Evaluating state for router '{source_node_id_for_router}'. Scratchpad: {state.get('workflow_scratchpad')}, Last Msg: {state['messages'][-1].type if state.get('messages') else 'N/A'}")
                
                last_message = state['messages'][-1] if state.get('messages') else None
                scratchpad = state.get('workflow_scratchpad', {})

                explicit_routing_signal_key = f"{source_node_id_for_router}_route_to"
                routing_condition_from_scratchpad = scratchpad.get(explicit_routing_signal_key)

                if routing_condition_from_scratchpad and routing_condition_from_scratchpad in current_node_conditional_map:
                    router_logger.info(f"Router '{source_node_id_for_router}': Explicit signal '{routing_condition_from_scratchpad}' in scratchpad. Routing to target: '{current_node_conditional_map[routing_condition_from_scratchpad]}'.")
                    return routing_condition_from_scratchpad

                has_tool_calls = isinstance(last_message, AIMessage) and bool(last_message.tool_calls)
                if has_tool_calls and "HAS_TOOL_CALLS" in current_node_conditional_map:
                    router_logger.info(f"Router '{source_node_id_for_router}': Tool call detected. Routing to target: '{current_node_conditional_map['HAS_TOOL_CALLS']}'.")
                    return "HAS_TOOL_CALLS"

                if not has_tool_calls and "NO_TOOL_CALLS" in current_node_conditional_map:
                    # This condition is tricky. It means the agent didn't call tools AND didn't set an explicit route.
                    # This is a fallback. Prompts should ensure agents set explicit routes.
                    router_logger.info(f"Router '{source_node_id_for_router}': No tool call and no explicit signal. Using NO_TOOL_CALLS fallback. Routing to target: '{current_node_conditional_map['NO_TOOL_CALLS']}'.")
                    return "NO_TOOL_CALLS"

                for condition_key, target_node in current_node_conditional_map.items():
                    if condition_key not in ["HAS_TOOL_CALLS", "NO_TOOL_CALLS", END, explicit_routing_signal_key, "ALWAYS"] \
                       and scratchpad.get(condition_key):
                        router_logger.info(f"Router '{source_node_id_for_router}': Scratchpad flag '{condition_key}' is true. Routing to target: '{target_node}'.")
                        return condition_key

                if "ALWAYS" in current_node_conditional_map:
                    router_logger.info(f"Router '{source_node_id_for_router}': Fallback to ALWAYS. Routing to target: '{current_node_conditional_map['ALWAYS']}'.")
                    return "ALWAYS"
                
                router_logger.warning(f"Router '{source_node_id_for_router}': No matching condition in map {current_node_conditional_map} and no ALWAYS/END fallback. Defaulting to END. State details: Last message type: {type(last_message)}, Tool calls: {has_tool_calls if last_message else 'N/A'}, Explicit signal: {routing_condition_from_scratchpad}")
                return END
            return router_function

        # Step 1: Add Agent Nodes
        for node_data in nodes_list:
            node_id = node_data.id
            agent_config_name = node_data.agent_config_name
            if agent_config_name not in agent_configs_map:
                raise ValueError(f"Agent config '{agent_config_name}' for node '{node_id}' not found.")
            agent_config = agent_configs_map[agent_config_name]
            llm_for_vision = "image" in agent_config.name.lower() or "vision" in agent_config.name.lower()
            llm_provider = self._get_llm_provider(agent_config.llm_choice, for_vision=llm_for_vision)
            tools_for_agent = self.tool_registry.get_tools_by_names(agent_config.allowed_tools)
            agent_node_instance = AgentNode(
                llm_provider=llm_provider,
                system_message_template=agent_config.system_message_template,
                tools=tools_for_agent,
                agent_config_name=agent_config.name,
                node_id=node_id
            )
            self.agent_nodes_instances[node_id] = agent_node_instance
            self.graph_builder.add_node(node_id, agent_node_instance.invoke)
            self.logger.info(f"Added agent node '{node_id}' (Agent: {agent_config.name}) to graph.")

        # Step 2: Add Tool Executor Node
        tool_executor_callable = tool_executor_node_factory(self.tool_registry)
        self.graph_builder.add_node("tool_executor", tool_executor_callable)
        self.logger.info("Added 'tool_executor' node to graph.")

        # Step 3: Set Graph Entry Point
        if start_node_id not in self.agent_nodes_instances:
             raise ValueError(f"Start node ID '{start_node_id}' does not correspond to any defined agent node.")
        self.graph_builder.set_entry_point(start_node_id)
        self.logger.info(f"Set graph entry point to '{start_node_id}'.")

        # Step 4: Add Conditional Edges from agent nodes (no change here)
        for source_node_id, node_cond_map in conditional_edge_maps.items():
            if source_node_id not in self.agent_nodes_instances:
                self.logger.warning(f"Source node '{source_node_id}' for conditional_edge_map not found. Skipping.")
                continue
            for cond_key, target_node_name in node_cond_map.items():
                if target_node_name != END and target_node_name not in self.agent_nodes_instances and target_node_name != "tool_executor":
                    raise ValueError(f"Target node '{target_node_name}' in conditional map for '{source_node_id}' ('{cond_key}') is not valid.")
            router_fn = create_router_function(source_node_id, node_cond_map)
            self.graph_builder.add_conditional_edges(source_node_id, router_fn, node_cond_map)
            self.logger.info(f"Added conditional edges from '{source_node_id}' with mapping: {node_cond_map}")

        # *** NEW STEP 5: Add Router and Conditional Edges for tool_executor ***
        # This router directs flow from tool_executor back to the agent that called it.
        def tool_executor_router(state: AgentState) -> str:
            calling_agent_node_id = state.get('workflow_scratchpad', {}).get('invoking_agent_for_tools')
            if not calling_agent_node_id:
                self.logger.error("ToolExecutorRouter: 'invoking_agent_for_tools' not found in scratchpad. Cannot route back. Ending workflow.")
                return END 
            
            if calling_agent_node_id not in self.agent_nodes_instances:
                self.logger.error(f"ToolExecutorRouter: Agent node ID '{calling_agent_node_id}' (from scratchpad) is not a registered agent node. Ending workflow.")
                return END

            self.logger.info(f"ToolExecutorRouter: Routing tool execution results back to agent node '{calling_agent_node_id}'.")
            return calling_agent_node_id # This returned string must be a key in the map below

        # The path_map for tool_executor's conditional edge maps the calling agent's node_id (returned by router)
        # to itself (the target node). Also include END for error cases.
        tool_executor_target_map = {node_id: node_id for node_id in self.agent_nodes_instances.keys()}
        tool_executor_target_map[END] = END # Handles cases where router returns END

        self.graph_builder.add_conditional_edges(
            "tool_executor",         # Source node is tool_executor
            tool_executor_router,    # Function that decides where to go next
            tool_executor_target_map # Map of possible destinations (agent_node_id -> agent_node_id)
        )
        self.logger.info(f"Added conditional edges from 'tool_executor' to route back to calling agents. Map: {tool_executor_target_map}")


        # Step 6: Add "ALWAYS" Edges (if any)
        for edge_data in self.workflow_definition_dict.get("edges", []):
            source_id = edge_data.get("source_node_id")
            target_id = edge_data.get("target_node_id")
            edge_type = edge_data.get("type", "ALWAYS").upper()
            if source_id and target_id and edge_type == "ALWAYS":
                valid_source = source_id in self.agent_nodes_instances or source_id == "tool_executor"
                valid_target = target_id == END or target_id in self.agent_nodes_instances or target_id == "tool_executor"
                if not valid_source: raise ValueError(f"Source node '{source_id}' for ALWAYS edge not found.")
                if not valid_target: raise ValueError(f"Target node '{target_id}' for ALWAYS edge not found.")
                actual_target = END if target_id.upper() == "END" else target_id
                self.graph_builder.add_edge(source_id, actual_target)
                self.logger.info(f"Added ALWAYS edge from '{source_id}' to '{actual_target}'.")
        
        # Step 7: Compile the graph
        self.runnable_graph = self.graph_builder.compile(checkpointer=self.memory)
        self.logger.info("Workflow graph compiled successfully.")

 

    async def arun_workflow(self, initial_input_payload: Dict[str, Any], thread_id: Optional[str] = None) -> Dict[str, Any]: 
        if not thread_id: thread_id = str(uuid4())
        new_recursion_limit = 15
        config: RunnableConfig = {
            "configurable": {"thread_id": thread_id},
            "recursion_limit": new_recursion_limit
        }
        
        task_description = initial_input_payload.get('task_description', 'No task description provided.')
        self.logger.info(f"Running workflow '{self.workflow_name}' for task: '{task_description}' with thread_id: {thread_id}")
        
        initial_messages = [HumanMessage(content=task_description)]
        
        # Prepare initial scratchpad, flattening campaign_details
        initial_scratchpad = initial_input_payload.copy() # Start with a copy of the payload
        if "campaign_details" in initial_scratchpad and isinstance(initial_scratchpad["campaign_details"], dict):
            for cd_key, cd_value in initial_scratchpad["campaign_details"].items():
                # Create flattened keys like campaign_description, campaign_data_requirements
                scratchpad_key = f"campaign_{cd_key.replace(' ', '_').lower()}" 
                initial_scratchpad[scratchpad_key] = cd_value
        # Remove original campaign_details if preferred, or keep for reference. For now, keeping.

        inputs_state: AgentState = {
            "messages": initial_messages,
            "agent_name": "WorkflowInitiator", # Initial agent name
            "workflow_scratchpad": initial_scratchpad,
            "current_task_description": task_description
        }

        final_state_dict: Dict[str, Any] = {} 
        try:
            # astream gives us each state update. The last one is the final state.
            async for event_chunk_value in self.runnable_graph.astream(inputs_state, config=config, stream_mode="values"):
                # event_chunk_value is the full state dict at each step
                # For logging, we can see the agent that produced this state
                agent_name_chunk = event_chunk_value.get('agent_name', 'UnknownAgent')
                self.logger.debug(f"\nWorkflow step for thread {thread_id} (Agent: {agent_name_chunk}):")
                if event_chunk_value.get("messages"):
                    last_msg_in_chunk = event_chunk_value["messages"][-1]
                    self.logger.debug(f"  Last Msg in chunk ({last_msg_in_chunk.type}): {str(last_msg_in_chunk.content)[:100]}... " + (f"Tool Calls: {last_msg_in_chunk.tool_calls}" if hasattr(last_msg_in_chunk, 'tool_calls') and last_msg_in_chunk.tool_calls else ""))
                
                final_state_dict = event_chunk_value # Keep updating, last one will be the final

            self.logger.info(f"Workflow '{self.workflow_name}' completed for thread_id: {thread_id}")
            # Ensure final_state_dict matches AgentState structure if possible, or is just the dict
            return final_state_dict # This will be the last state dict from the stream
        except Exception as e:
            self.logger.error(f"Error during async workflow execution for thread_id {thread_id}: {e}", exc_info=True)
            error_message_content = f"Workflow error: {str(e)}. Check logs for details. Thread ID: {thread_id}"
            error_message = HumanMessage(content=error_message_content, id="error_" + str(uuid4()))
            
            # Return a state dict that matches AgentState structure
            return {
                "messages": initial_messages + [error_message], # Append error to existing messages
                "agent_name": "SystemError",
                "workflow_scratchpad": initial_scratchpad, # Scratchpad at time of error might be hard to get, use initial
                "current_task_description": task_description
            }

    def run_workflow(self, initial_input_payload: Dict[str, Any], thread_id: Optional[str] = None) -> Dict[str, Any]:
        # Sync wrapper for arun_workflow
        self.logger.info("Using synchronous run_workflow wrapper. Consider using arun_workflow for native async execution if in an async context.")
        return asyncio.run(self.arun_workflow(initial_input_payload, thread_id))


# # --- Main Application Entry Point ---
# if __name__ == "__main__":
#     logger.info("Initializing Enterprise Multi-Agent System with Verification Workflow...")

#     if not CONFIG.GOOGLE_API_KEY:
#         logger.error("GEMINI_API_KEY environment variable not set. Critical functionality will fail.")
#         # Potentially exit or raise an error if this is critical for the script's purpose
#         # exit(1) 

#     # --- Data Verification Workflow Definition ---

#     # (The rest of your __main__ script for creating dummy files and running workflows remains the same)
#     # ... (ensure this part is included from your original script) ...
#     # Ensure dummy files exist for testing (paths from original log)
#     base_data_path = "/Users/naija/Documents/gigs/hyvve-backend/data/" # Ensure this path is correct for your system
#     dummy_image_path = os.path.join(base_data_path, "image.jpeg") 
#     dummy_text_path = os.path.join(base_data_path, "text.txt")

#     os.makedirs(base_data_path, exist_ok=True)

#     if not os.path.exists(dummy_image_path):
#         try:
#             from PIL import Image
#             img = Image.new('RGB', (60, 30), color = 'red')
#             img.save(dummy_image_path, "JPEG")
#             logger.info(f"Created dummy JPEG image at {dummy_image_path}")
#         except ImportError:
#             logger.warning(f"Pillow not installed. Cannot create dummy image. Please ensure {dummy_image_path} exists or create it manually.")
#         except Exception as e:
#             logger.error(f"Could not create dummy image {dummy_image_path}: {e}")


#     with open(dummy_text_path, "w", encoding="utf-8") as f:
#         f.write("This is a sample product review. The gadget is innovative and user-friendly. "
#                 "Its battery life is impressive, and the primary display is crystal clear. "
#                 "However, the secondary sensor could be more responsive. Overall, a great buy!")
#     logger.info(f"Created/updated dummy text file at {dummy_text_path}")


#     task_input_image = {
#         "submitted_data_path": dummy_image_path, 
#         "wallet_address": "0x123TestWalletForImageCache",
#         "campaign_details": {
#             "campaign_description": "A campaign for a new brand of gourmet cat food. We are looking for authentic images of cats enjoying meals.",
#             "campaign_data_requirements": "Image must be a clear, well-lit photo of a single cat. The cat should appear healthy and content. No humans or other animals in the shot. Product packaging is a plus but not mandatory. Minimum resolution 600x600.",
#             "onchain_campaign_id": "campaign_img_001",
#             "required_quality_score": 65.0 
#         },
#         "task_description": "Verify the submitted cat image for the gourmet cat food campaign."
#     }

#     task_input_text = {
#         "submitted_data_path": dummy_text_path,
#         "wallet_address": "0x456TestWalletForTextCache",
#         "campaign_details": {
#             "campaign_description": "Product review campaign for a new high-tech gadget.",
#             "campaign_data_requirements": "Review must be between 50 and 500 words, in English. It should be original, express a clear sentiment, and focus on the product's features and usability. No profanity. Mention at least two specific features.",
#             "onchain_campaign_id": "campaign_txt_002",
#             "required_quality_score": 75.0
#         },
#         "task_description": "Verify the submitted product review for the new gadget campaign."
#     }

#     async def run_workflows():
#         # Image verification run
#         thread_id_image = "image_workflow_run_" + str(uuid4())
#         logger.info(f"\n--- Starting Image Verification Workflow (Thread: {thread_id_image}) ---")
#         final_state_image = await workflow_manager.arun_workflow(task_input_image, thread_id=thread_id_image)
#         logger.info(f"\n--- Final State for Image Verification (Thread: {thread_id_image}) ---")
#         if final_state_image: 
#             logger.info(f"Final Agent: {final_state_image.get('agent_name', 'N/A')}")
#             logger.info("Final Messages:")
#             for msg_idx, msg in enumerate(final_state_image.get("messages", [])):
#                 content_str = str(msg.content if hasattr(msg, 'content') else msg)[:250]
#                 logger.info(f"  Msg[{msg_idx}] ({msg.type}): {content_str}...")
#             logger.info(f"Final Scratchpad: {json.dumps(final_state_image.get('workflow_scratchpad'), indent=2, default=str)}")
#         else:
#             logger.info("  Image Workflow did not return a final state or returned None.")

#         # Text verification run
#         thread_id_text = "text_workflow_run_" + str(uuid4())
#         logger.info(f"\n--- Starting Text Verification Workflow (Thread: {thread_id_text}) ---")
#         final_state_text = await workflow_manager.arun_workflow(task_input_text, thread_id=thread_id_text)
#         logger.info(f"\n--- Final State for Text Verification (Thread: {thread_id_text}) ---")
#         if final_state_text: 
#             logger.info(f"Final Agent: {final_state_text.get('agent_name', 'N/A')}")
#             logger.info("Final Messages:")
#             for msg_idx, msg in enumerate(final_state_text.get("messages", [])):
#                 content_str = str(msg.content if hasattr(msg, 'content') else msg)[:250]
#                 logger.info(f"  Msg[{msg_idx}] ({msg.type}): {content_str}...")
#             logger.info(f"Final Scratchpad: {json.dumps(final_state_text.get('workflow_scratchpad'), indent=2, default=str)}")
#         else:
#             logger.info("  Text Workflow did not return a final state or returned None.")

#     asyncio.run(run_workflows())

#     logger.info("System finished.")