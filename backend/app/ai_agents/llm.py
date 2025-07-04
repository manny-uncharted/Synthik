import logging
import pydantic
from typing import Any, Optional, Union

from langchain_core.exceptions import OutputParserException
from langchain_core.language_models.base import LanguageModelInput
from langchain_core.messages import BaseMessage, SystemMessage
from langchain_core.output_parsers import PydanticOutputParser, StrOutputParser
from langchain_core.prompt_values import ChatPromptValue
from langchain_core.rate_limiters import BaseRateLimiter
from langchain_core.runnables.base import Runnable
from langchain_core.runnables.config import RunnableConfig
from langchain_openai import ChatOpenAI
from langchain_core.rate_limiters import BaseRateLimiter


class LLMWrapper(Runnable):
    def __init__(
        self,
        provider: str,
        model: str,
        temperature: float = 0.0,
        max_tokens: int = 8192,
        rate_limiter: Union[BaseRateLimiter, None] = None,
    ):
        """
        A wrapper class for various LLM providers that standardizes their interfaces.

        This class provides a unified interface for working with different LLM providers
        (OpenAI, Google, Anthropic) while handling provider-specific implementation details.
        It supports structured output parsing and rate limiting across all providers.

        Args:
            provider (str): The LLM provider to use ('openai', 'google', or 'anthropic')
            model (str): The specific model name/identifier for the chosen provider
            temperature (float, optional): Controls randomness in responses. Defaults to 1.0
            max_tokens (int, optional): Maximum tokens in response. Defaults to 8192
            rate_limiter (BaseRateLimiter | None, optional): Rate limiter for API calls. Defaults to None

        Raises:
            ValueError: If an unsupported provider is specified

        The wrapper normalizes differences between providers, particularly around:
        - Structured output parsing
        - Message formatting
        - Rate limiting implementation
        """
        self.provider = provider
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.rate_limiter = rate_limiter
        self.parser = StrOutputParser()
        self.schema = None

        provider_to_model = {
            "openai": ChatOpenAI,
        }

        if self.provider not in provider_to_model:
            raise ValueError(f"Unsupported LLM provider: {self.provider}")

        model_class = provider_to_model[self.provider]
        self.llm = model_class(
            model=self.model, rate_limiter=self.rate_limiter, max_tokens=self.max_tokens
        )

    def coerce_to_schema(self, llm_output: str):
        """
        Coerce raw LLM output into a structured schema object.

        Takes unstructured text output from the LLM and attempts to parse it into
        a structured Pydantic object based on the defined schema. Currently supports
        Question and Answer schema types.

        Args:
            llm_output (str): Raw text output from the LLM to be coerced

        Returns:
            BaseModel: Pydantic object matching the defined schema type

        Raises:
            ValueError: If no schema is defined
            OutputParserException: If output cannot be coerced to the schema

        The coercion maps the raw text to the appropriate schema field:
        - Question schema -> 'question' field
        - Answer schema -> 'answer' field
        """
        if not self.schema:
            raise ValueError("Schema is not defined.")

        schema_class_name = self.schema.__name__

        if schema_class_name == "Question":
            schema_field_name = "question"
        elif schema_class_name == "Answer":
            schema_field_name = "answer"
        else:
            raise OutputParserException(
                f"Unable to coerce output to schema: {schema_class_name}",
                llm_output=llm_output,
            )

        schema_values = {schema_field_name: llm_output}
        pydantic_object = self.schema(**schema_values)
        return pydantic_object

    def invoke(
        self,
        input: LanguageModelInput,
        config: Optional[RunnableConfig] = None,
        **kwargs: Any,
    ) -> BaseMessage:
        """
        Invoke the LLM with the given input and configuration.

        This method handles provider-specific invocation details while maintaining a consistent
        interface. It manages structured output formatting and parsing based on the provider's
        capabilities.

        Args:
            input (LanguageModelInput): The input to send to the LLM, typically messages or prompts
            config (Optional[RunnableConfig]): Optional configuration for the invocation
            **kwargs (Any): Additional keyword arguments passed to the underlying LLM

        Returns:
            BaseMessage: The LLM's response message

        The implementation varies by provider:
        - OpenAI: Direct invocation with native structured output support
        """
        prompt = input

        if self.provider == "google" and self.schema is not None:
            format_instructions = self.parser.get_format_instructions()
            messages = input.to_messages()
            messages[0] = SystemMessage(
                content=f"{messages[0].content}\n{format_instructions}"
            )
            prompt = ChatPromptValue(messages=messages)

        try:
            return self.llm.invoke(input=prompt, config=config)
        except OutputParserException as ex:
            return self.coerce_to_schema(ex.llm_output)

    def with_structured_output(self, schema: pydantic.BaseModel):
        """
        Configure the LLM wrapper to output structured data using a Pydantic schema.

        This method adapts the underlying LLM to output responses conforming to the provided
        Pydantic model schema. The implementation varies by provider:

        - OpenAI/Anthropic: Uses native structured output support
        - Google: Implements structured output via output parser and format instructions

        Args:
            schema (pydantic.BaseModel): The Pydantic model class defining the expected
                response structure

        Returns:
            LLMWrapper: The wrapper instance configured for structured output
        """
        if self.provider in (
            "openai",
        ):
            self.llm = self.llm.with_structured_output(schema)

        return self


def get_fast_llm(fast_llm_provider: str = "openai", rate_limiter: BaseRateLimiter | None = None):
    """
    Get a fast LLM model optimized for quick responses.

    Creates and returns an LLM wrapper configured with a fast model variant from the
    specified provider. Fast models trade some quality for improved response speed.

    Args:
        config (PodcastConfig): Configuration object containing provider settings
        rate_limiter (BaseRateLimiter | None, optional): Rate limiter to control API request
            frequency. Defaults to None.

    Returns:
        LLMWrapper: Wrapper instance configured with a fast model variant

    Raises:
        ValueError: If the configured fast_llm_provider is not supported

    The function maps providers to their respective fast model variants:
    - OpenAI: gpt-4o
    """
    fast_llm_models = {
        "openai": "gpt-4o",
    }

    if fast_llm_provider not in fast_llm_models:
        raise ValueError(
            f"The fast_llm_provider value '{fast_llm_provider}' is not supported."
        )

    return LLMWrapper(
        fast_llm_provider,
        fast_llm_models[fast_llm_provider],
        rate_limiter=rate_limiter,
    )


def get_long_context_llm(
    long_context_llm_provider: str = "openai", rate_limiter: BaseRateLimiter | None = None
):
    """
    Get a long context LLM model optimized for handling larger prompts.

    Creates and returns an LLM wrapper configured with a model variant that can handle
    longer context windows from the specified provider. These models are optimized for
    processing larger amounts of text at once.

    Args:
        config (PodcastConfig): Configuration object containing provider settings
        rate_limiter (BaseRateLimiter | None, optional): Rate limiter to control API request
            frequency. Defaults to None.

    Returns:
        LLMWrapper: Wrapper instance configured with a long context model variant

    Raises:
        ValueError: If the configured long_context_llm_provider is not supported

    The function maps providers to their respective long context model variants:
    - OpenAI: gpt-4o
    """
    long_context_llm_models = {
        "openai": "gpt-4o",
    }

    if long_context_llm_provider not in long_context_llm_models:
        raise ValueError(
            f"The long_context_llm_provider value '{long_context_llm_provider}' is not supported."
        )

    return LLMWrapper(
        long_context_llm_provider,
        long_context_llm_models[long_context_llm_provider],
        rate_limiter=rate_limiter,
    )
