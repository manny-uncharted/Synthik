from pydantic import BaseModel, Field, conlist, constr
from typing import List, Optional, Any
from datetime import datetime


def to_camel(string: str) -> str:
    parts = string.split("_")
    return parts[0] + "".join(word.capitalize() for word in parts[1:])


class SchemaFieldConstraint(BaseModel):
    required: Optional[bool] = False
    unique: Optional[bool] = False
    min: Optional[float] = None       # ← now has default
    max: Optional[float] = None       # ← now has default
    pattern: Optional[str] = None     # ← now has default
    enum: Optional[List[str]] = []

class SchemaField(BaseModel):
    id: str
    name: str
    type: str
    description: Optional[str]
    constraints: SchemaFieldConstraint

class DatasetBase(BaseModel):
    name: constr(min_length=1, max_length=255)
    description: Optional[str] = None
    category: Optional[str] = None
    tags: List[str] = Field(default_factory=list)

    # format must be one of json, csv, parquet
    format: str = Field(
        "csv", 
        pattern=r"^(json|csv|parquet|png|jpg|jpeg|gif|webp)$",
        description="Data format: json, csv, parquet, or png, jpg, jpeg, gif, webp"
    )

    data_schema_fields: List[SchemaField]

    # visibility must be one of public, private, restricted
    visibility: str = Field(
        "public",
        pattern=r"^(public|private|restricted)$",
        description="Visibility: public, private, or restricted"
    )

    license: Optional[str] = None
    price: float = Field(0.0, ge=0.0)
    pricePerRow: float = Field(0.0, ge=0.0)
    metadata_cid: str
    dataset_cid: str
    dataset_preview_cid: str

    class Config:
        from_attributes = True

class GenerationLineage(BaseModel):
    model: Optional[str]
    technique: Optional[str]
    seedData: Optional[str]
    augmentationSteps: Optional[List[str]]
    quality: Optional[str]
    verification: Optional[bool]



class DatasetCreate(DatasetBase):
    pass  # all fields inherited

class DatasetResponse(BaseModel):
    id: str  
    creator_id: str
    name: str
    description: Optional[str]
    category: Optional[str]
    tags: List[str]
    visibility: str
    license: Optional[str]
    price: float
    format: str
    metadata_cid: str
    dataset_preview_cid: str
    dataset_cid: str
    pricePerRow: float  = Field(alias="price_per_row")
    datasetType: str    = Field(alias="dataset_type")

    class Config:
        from_attributes     = True
        populate_by_name    = True
        alias_generator     = to_camel
        allow_population_by_field_name = True


class DatasetListResponse(BaseModel):
    datasets: List[DatasetResponse]
    page: int
    limit: int
    total: int
    totalPages: int
