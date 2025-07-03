# synthetic_tools/csv_llm.py

import os
import json
import asyncio
import random
import csv
from datetime import datetime, timedelta
from typing import List, Optional, Any, Type, Dict
from pydantic import BaseModel, Field, validator, root_validator
from langchain_core.tools import BaseTool
from uuid import uuid4

from app.generation.synthetic_generation_tools import (
    SyntheticImageGenerationTool,
)
from app.generation.text_llm import SyntheticTextGenerationTool
from app.core.logger import logger


class ColumnSpec(BaseModel):
    """
    Describes how to generate one column in the CSV.
    """
    name: str = Field(..., description="CSV column header")
    type: str = Field(..., description="One of: text, image, number, date, categorical")
    # For text & image:
    prompt: Optional[str] = None
    model: Optional[str] = None
    # For number:
    min: Optional[float] = None
    max: Optional[float] = None
    # For date:
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    # For categorical:
    categories: Optional[List[str]] = None
    # How many rows to generate? In tool input you'll specify rows globally
    # so no per-column count needed here.

    @validator("type")
    def check_type(cls, v):
        allowed = {"text", "image", "number", "date", "categorical"}
        if v not in allowed:
            raise ValueError(f"type must be one of {allowed}")
        return v

    @root_validator
    def check_required_fields(cls, values):
        t = values.get("type")
        if t in {"text", "image"} and not values.get("prompt"):
            raise ValueError(f"prompt is required for type '{t}'")
        if t == "number" and (values.get("min") is None or values.get("max") is None):
            raise ValueError("min and max are required for type 'number'")
        if t == "date" and (values.get("start_date") is None or values.get("end_date") is None):
            raise ValueError("start_date and end_date are required for type 'date'")
        if t == "categorical" and not values.get("categories"):
            raise ValueError("categories list is required for type 'categorical'")
        return values


class CSVSchema(BaseModel):
    """
    Tool input for generic CSV generation.
    """
    columns: List[ColumnSpec] = Field(..., description="List of column specifications")
    rows: int = Field(..., gt=0, description="Number of rows to generate")
    output_path: str = Field("generated.csv", description="Where to write the CSV")
    # Optional global delays for image generation
    image_delay_seconds: float = Field(1.0, description="Delay between image calls")


class SyntheticCSVGenerationTool(BaseTool):
    name = "generate_synthetic_csv"
    description = (
        "Generate a CSV with arbitrary schema: text, image, number, date or categorical columns."
    )
    args_schema: Type[BaseModel] = CSVSchema

    async def _arun(
        self,
        columns: List[Dict[str, Any]],
        rows: int,
        output_path: str,
        image_delay_seconds: float = 1.0,
    ) -> str:
        schema = [ColumnSpec(**col) for col in columns]

        # Prepare per-column buffers
        data: List[dict] = [ {} for _ in range(rows) ]

        # 1) Text columns
        text_cols = [c for c in schema if c.type == "text"]
        for col in text_cols:
            tool = SyntheticTextGenerationTool()
            # generate all samples in one batch
            resp = await tool._arun(
                prompt=col.prompt,
                num_samples=rows,
                model=col.model or "gemini-2.5-pro-preview-05-06",
                max_length=256,
            )
            texts = json.loads(resp)["samples"]
            for i, txt in enumerate(texts):
                data[i][col.name] = txt

        # 2) Image columns
        img_cols = [c for c in schema if c.type == "image"]
        for col in img_cols:
            tool = SyntheticImageGenerationTool()
            resp = await tool._arun(
                prompt=col.prompt,
                num_images=rows,
                model=col.model or "sdxl-turbo",
                output_dir=os.path.dirname(output_path) or ".",
                delay_seconds=image_delay_seconds,
            )
            images = json.loads(resp)["images"]
            for i, img in enumerate(images):
                data[i][col.name] = img

        # 3) Number columns
        num_cols = [c for c in schema if c.type == "number"]
        for col in num_cols:
            for i in range(rows):
                data[i][col.name] = round(random.uniform(col.min, col.max), 4)

        # 4) Date columns
        date_cols = [c for c in schema if c.type == "date"]
        for col in date_cols:
            start = col.start_date
            end = col.end_date
            delta = (end - start).total_seconds()
            for i in range(rows):
                rand_sec = random.random() * delta
                dt = start + timedelta(seconds=rand_sec)
                data[i][col.name] = dt.isoformat()

        # 5) Categorical columns
        cat_cols = [c for c in schema if c.type == "categorical"]
        for col in cat_cols:
            for i in range(rows):
                data[i][col.name] = random.choice(col.categories)

        # Write CSV
        with open(output_path, "w", newline="", encoding="utf-8") as fp:
            writer = csv.DictWriter(fp, fieldnames=[c.name for c in schema])
            writer.writeheader()
            for row in data:
                writer.writerow(row)

        return json.dumps({
            "csv_path": output_path,
            "rows": rows,
            "columns": [c.name for c in schema]
        })

    def _run(self, **kwargs) -> str:
        return asyncio.run(self._arun(**kwargs))


# from synthetic_tools.csv_llm import SyntheticCSVGenerationTool

# tool = SyntheticCSVGenerationTool()
# input_payload = {
#   "columns": [
#     {"name":"id","type":"categorical","categories":[str(uuid4()) for _ in range(100)]},
#     {"name":"review","type":"text","prompt":"Write a 20-word product review","model":"gemini-2.5-pro-preview-05-06"},
#     {"name":"rating","type":"number","min":1,"max":5},
#     {"name":"photo","type":"image","prompt":"A happy customer using the product","model":"sdxl-turbo"}
#   ],
#   "rows": 50,
#   "output_path": "reviews_dataset.csv",
#   "image_delay_seconds": 1.5
# }
# result_json = tool.invoke(input_payload)
# print(result_json)  # tells you where the CSV landed
