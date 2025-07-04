# synthetic_generation_tools.py

import os
import json
import asyncio
from typing import Type
from pydantic import BaseModel, Field, conint
from langchain_core.tools import BaseTool
from uuid import uuid4

from app.core.logger import logger

try:
    import google.generativeai as genai
    from langchain_google_genai import ChatGoogleGenerativeAI
except ImportError:
    logger.warning("Google Generative AI SDK or LangChain Google integration not found. Google LLM functionality will be disabled. pip install google-generativeai langchain-google-genai")
    genai = None
    ChatGoogleGenerativeAI = None


from app.ai_verification.utils.lilypad import LilypadClient 


class ImageGenInput(BaseModel):
    prompt: str = Field(..., description="Image prompt for generation")
    num_images: conint(gt=0, le=20) = Field(..., description="Number of images to generate")
    model: str = Field("sdxl-turbo", description="Image model to use")
    output_dir: str = Field("generated_images", description="Directory to save images")
    delay_seconds: float = Field(1.0, description="Delay between each image generation call")


class CSVGenInput(BaseModel):
    text_prompt: str = Field(..., description="Prompt for text entries")
    image_prompt: str = Field(..., description="Prompt for image entries")
    text_samples: conint(gt=0, le=100) = Field(10, description="Number of text rows")
    image_samples: conint(gt=0, le=10) = Field(5, description="Number of image rows")
    text_model: str = Field("gemini-2.5-pro-preview-05-06")
    image_model: str = Field("sdxl-turbo")
    csv_path: str = Field("dataset.csv", description="Output CSV filename")


class SyntheticImageGenerationTool(BaseTool):
    name: str = "generate_synthetic_images"
    description: str = (
        "Generate multiple images via Lilypad, saving each to disk. "
        "Respects a delay between calls to avoid 429 rate-limits."
    )

    args_schema: Type[BaseModel] = ImageGenInput

    async def _arun(
        self,
        prompt: str,
        num_images: int,
        model: str,
        output_dir: str,
        delay_seconds: float,
    ) -> str:
        os.makedirs(output_dir, exist_ok=True)
        client = LilypadClient(api_key=os.getenv("LILYPAD_API_KEY"))
        saved_files = []

        for i in range(num_images):
            logger.info(f"[ImageGen] Generating image {i+1}/{num_images}")
            try:
                img_bytes = client.generate_image(prompt=prompt, model=model)
                filename = os.path.join(output_dir, f"{uuid4()}.png")
                with open(filename, "wb") as f:
                    f.write(img_bytes)
                saved_files.append(filename)
            except Exception as e:
                logger.error(f"[ImageGen] Error generating image {i+1}: {e}")
                saved_files.append(f"ERROR: {e}")
            # delay to prevent hitting rate limits
            if i < num_images - 1:
                await asyncio.sleep(delay_seconds)

        return json.dumps({"images": saved_files})

    def _run(
        self,
        prompt: str,
        num_images: int,
        model: str,
        output_dir: str,
        delay_seconds: float,
    ) -> str:
        return asyncio.run(
            self._arun(prompt, num_images, model, output_dir, delay_seconds)
        )