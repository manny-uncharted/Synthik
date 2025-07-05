from pydantic import BaseModel, Field, conlist, constr
from typing import List, Optional, Any
from datetime import datetime

class SchemaFieldConstraint(BaseModel):
    required: Optional[bool] = False
    unique: Optional[bool] = False
    min: Optional[float]
    max: Optional[float]
    pattern: Optional[str]
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

class DatasetResponse(DatasetBase):
    id: str
    creator_id: str
    rows: int
    tokens: int
    is_verified: bool
    is_locked: bool
    downloads: int
    views: int
    purchases: int
    stars: int
    rating: float
    previewRows: int
    previewFilecoinCID: Optional[str]
    fullFilecoinCID: Optional[str]
    transactionHash: Optional[str]
    metadata_cid: str
    dataset_cid: str
    dataset_preview_cid: str
    blockNumber: Optional[int]
    generationLineage: Optional[GenerationLineage]
    createdAt: datetime
    updatedAt: datetime
    lastModified: datetime
    status: str

    class Config:
        from_attributes = True

class DatasetListResponse(BaseModel):
    datasets: List[DatasetResponse]
    page: int
    limit: int
    total: int
    totalPages: int
