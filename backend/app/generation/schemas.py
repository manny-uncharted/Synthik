from pydantic import BaseModel, Field, conint, constr
from typing import List, Any, Dict, Optional
from datetime import datetime


from app.dataset.schemas import SchemaField  # assuming SchemaField is already defined

class Template(BaseModel):
    id: str
    name: str
    description: str
    category: str
    schema: List[SchemaField]
    previewData: List[Dict[str, Any]]
    useCases: List[str]
    estimatedRows: int

class TemplatesResponse(BaseModel):
    templates: List[Template]

class PreviewConfig(BaseModel):
    schema: List[SchemaField]
    rows: conint(gt=0, le=50)
    model: constr(min_length=1)
    quality: constr(regex="^(fast|balanced|high)$")

class PreviewRequest(BaseModel):
    config: PreviewConfig

class PreviewResponse(BaseModel):
    preview: List[dict]
    generationTime: float  # seconds
    estimatedCost: float   # in USD or ETH, depending on your billing

    class Config:
        schema_extra = {
            "example": {
                "preview": [{"field1": "value1", "field2": 123}],
                "generationTime": 0.23,
                "estimatedCost": 0.005
            }
        }


class GenerationJobResponse(BaseModel):
    id: str
    datasetId: str = Field(..., alias="dataset_id")
    userId: str = Field(..., alias="user_id")
    status: str
    progress: int
    config: Dict[str, Any]
    result: Dict[str, Any]
    error: Optional[str]
    createdAt: datetime = Field(..., alias="created_at")
    updatedAt: datetime = Field(..., alias="updated_at")
    completedAt: Optional[datetime] = Field(None, alias="completed_at")

    class Config:
        orm_mode = True
        allow_population_by_field_name = True