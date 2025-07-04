from pydantic import BaseModel, Field, conint, constr
from typing import List, Any, Dict, Optional, Literal
from datetime import datetime


class Constraints(BaseModel):
    required: Optional[bool] = None
    min: Optional[float] = None
    max: Optional[float] = None
    pattern: Optional[str] = None


class SchemaField(BaseModel):
    id: str
    name: str
    type: str
    description: str
    constraints: Constraints

class Template(BaseModel):
    id: str
    name: str
    description: str
    category: str
    data_schema_field: List[SchemaField]
    previewData: List[Dict[str, Any]]
    useCases: List[str]
    estimatedRows: int


class TemplatesResponse(BaseModel):
    templates: List[Template]


class PreviewConfig(BaseModel):
    data_schema_field: List[SchemaField]
    rows: conint(gt=0, le=50)
    model: str = Field(..., min_length=1)
    # use Literal to constrain to exactly these three values
    quality: Literal["fast", "balanced", "high"]  


class PreviewRequest(BaseModel):
    config: PreviewConfig


class PreviewResponse(BaseModel):
    preview: List[dict]
    generationTime: float  # seconds
    estimatedCost: float   # in USD or ETH, depending on billing

    model_config = {
        "json_schema_extra": {
            "example": {
                "preview": [{"field1": "value1", "field2": 123}],
                "generationTime": 0.23,
                "estimatedCost": 0.005
            }
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
        from_attributes = True
        populate_by_name = True

