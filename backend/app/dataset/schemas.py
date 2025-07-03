from pydantic import BaseModel, Field, conlist, constr
from typing import List, Optional, Any
from datetime import datetime

class SchemaField(BaseModel):
    id: str
    name: str
    type: str
    description: Optional[str]
    constraints: Optional[dict]

class GenerationLineage(BaseModel):
    model: Optional[str]
    technique: Optional[str]
    seedData: Optional[str]
    augmentationSteps: Optional[List[str]]
    quality: Optional[str]
    verification: Optional[bool]

class DatasetBase(BaseModel):
    name: constr(min_length=1, max_length=255)
    description: Optional[str]
    category: Optional[str]
    tags: Optional[List[str]] = []
    format: constr(regex="^(json|csv|parquet)$")
    schema: List[SchemaField]
    visibility: Optional[constr(regex="^(public|private|restricted)$")] = "public"
    license: Optional[str]
    price: float = 0.0
    pricePerRow: float = 0.0

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
    blockNumber: Optional[int]
    generationLineage: Optional[GenerationLineage]
    createdAt: datetime
    updatedAt: datetime
    lastModified: datetime
    status: str

    class Config:
        orm_mode = True

class DatasetListResponse(BaseModel):
    datasets: List[DatasetResponse]
    page: int
    limit: int
    total: int
    totalPages: int
