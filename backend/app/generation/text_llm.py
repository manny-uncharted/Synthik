# synthetic_tools/text_llm.py

import os
import asyncio
from typing import Optional, Union, Type
from pydantic import BaseModel, Field, conint
from atoma_sdk import AtomaSDK
from langchain_google_genai import ChatGoogleGenerativeAI
from app.ai_agents.enterprise_workflow import AtomaLangChainWrapper
from app.ai_verification.utils import LilypadLLMWrapper
from langchain_core.runnables import Runnable
from app.core.logger import logger


class TextGenInput(BaseModel):
    prompt: str = Field(..., description="Text prompt for generation")
    num_samples: conint(gt=0, le=100) = Field(..., description="Number of text samples")
    model: str = Field("gemini-2.5-pro-preview-05-06", description="LLM model to use")
    max_length: conint(gt=0, le=2048) = Field(256, description="Max tokens per sample")

class AsyncSyncWrapper:
    """
    Wraps a sync .invoke(...) LLM so that you also get an async .ainvoke(...)
    and can still call .with_structured_output(schema).
    """
    def __init__(self, sync_llm: Runnable):
        self._sync_llm = sync_llm

    def invoke(self, *args, **kwargs):
        return self._sync_llm.invoke(*args, **kwargs)

    async def ainvoke(self, *args, **kwargs):
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._sync_llm.invoke, *args, **kwargs)

    def with_structured_output(self, schema, **kwargs):
        wrapped = self._sync_llm.with_structured_output(schema, **kwargs)
        return AsyncSyncWrapper(wrapped)


def get_text_llm(
    provider: Optional[str] = None,
    model_name: Optional[str] = None,
    temperature: float = 0.0,
) -> Union[ChatGoogleGenerativeAI, AsyncSyncWrapper]:
    """
    Pick your text LLM backend:
      - 'google'  → ChatGoogleGenerativeAI (native .ainvoke)
      - 'lilypad' → LilypadLLMWrapper wrapped with AsyncSyncWrapper
      - 'atoma'   → AtomaLangChainWrapper wrapped with AsyncSyncWrapper

    Default provider order:
      1) explicit `provider` arg
      2) env LLM_PROVIDER
      3) fallback to 'google'

    Raises RuntimeError if nothing could be initialized.
    """
    choice = (provider or os.getenv("LLM_PROVIDER") or "google").lower()
    logger.info(f"[LLM] Requested provider: {choice!r}")

    # 1) Google Gemini via LangChain
    if choice == "google":
        api_key = os.getenv("GEMINI_API_KEY")
        model = model_name or os.getenv("DEFAULT_GOOGLE_MODEL", "gemini-2.5-pro-preview-05-06")
        if api_key:
            try:
                logger.info(f"[LLM] Initializing Gemini model '{model}'")
                return ChatGoogleGenerativeAI(
                    model=model,
                    google_api_key=api_key,
                    temperature=temperature
                )
            except Exception as e:
                logger.error(f"[LLM] Failed to init ChatGoogleGenerativeAI: {e}", exc_info=True)
        else:
            logger.warning("[LLM] GEMINI_API_KEY not set; skipping Google Gemini")

    # 2) Lilypad
    if choice == "lilypad":
        model = model_name or os.getenv("DEFAULT_LILYPAD_MODEL", "llama3.1:8b")
        try:
            logger.info(f"[LLM] Initializing Lilypad model '{model}'")
            sync_llm = LilypadLLMWrapper(model=model, temperature=temperature)
            return AsyncSyncWrapper(sync_llm)
        except Exception as e:
            logger.error(f"[LLM] Failed to init LilypadLLMWrapper: {e}", exc_info=True)

    # 3) Atoma fallback
    model = model_name or os.getenv("DEFAULT_ATOMA_MODEL", "Infermatic/Llama-3.3-70B-Instruct-FP8-Dynamic")
    atoma_key = os.getenv("ATOMASDK_BEARER_AUTH")
    if AtomaSDK and atoma_key:
        try:
            logger.info(f"[LLM] Initializing Atoma model '{model}'")
            sync_llm = AtomaLangChainWrapper(model_name=model, api_key=atoma_key)
            return AsyncSyncWrapper(sync_llm)
        except Exception as e:
            logger.error(f"[LLM] Failed to init AtomaLangChainWrapper: {e}", exc_info=True)
    else:
        logger.warning("[LLM] AtomaSDK or ATOMASDK_BEARER_AUTH not available; skipping Atoma")

    # nothing worked
    raise RuntimeError(
        "No text‐generation LLM could be initialized. "
        "Please set GEMINI_API_KEY or ATOMASDK_BEARER_AUTH (and/or LLM_PROVIDER)."
    )



class SyntheticTextGenerationTool(BaseTool):
    name = "generate_synthetic_text"
    description = "Generate multiple text samples using a chat‐style LLM."

    args_schema: Type[BaseModel] = TextGenInput

    async def _arun(self, prompt: str, num_samples: int, model: str, max_length: int) -> str:
        llm = get_text_llm(model_name=model)
        samples = []
        for i in range(num_samples):
            logger.info(f"[TextGen] Generating sample {i+1}/{num_samples}")
            # assume llm.ainvoke returns the generated text
            response = await llm.ainvoke({"prompt": prompt, "max_length": max_length})
            # response might be BaseMessage or str
            text = response.content if hasattr(response, "content") else str(response)
            samples.append(text.strip())
        return json.dumps({"samples": samples})

    def _run(self, prompt: str, num_samples: int, model: str, max_length: int) -> str:
        return asyncio.run(self._arun(prompt, num_samples, model, max_length))