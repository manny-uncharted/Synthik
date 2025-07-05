import uuid
from sqlalchemy import (
    Column, String, Text, Boolean, Integer, Float, DateTime, Enum, JSON
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

from datetime import datetime

from app.core.database import Base
from app.core.types import StringArray

class Dataset(Base):
    __tablename__ = "datasets"

    id: str = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: str = Column(String(255), nullable=False)
    description: str = Column(Text, nullable=True)
    category: str = Column(String(100), nullable=True)
    tags = Column(StringArray, default=list, nullable=False)
    creator_id: str = Column(String, nullable=False)
    size: str = Column(String(50), nullable=True)
    rows: int = Column(Integer, default=0)
    tokens: int = Column(Integer, default=0)
    format: str = Column(String(20), nullable=False)
    dataset_type: str = Column(String(20), nullable=False)
    schema = Column(JSON, default=[])
    is_verified: bool = Column(Boolean, default=False)
    is_locked: bool = Column(Boolean, default=False)
    price: float = Column(Float, default=0.0)
    price_per_row: float = Column(Float, default=0.0)
    currency: str = Column(String(10), default="USD")
    license: str = Column(String(100), nullable=True)
    visibility: str = Column(String(20), default="public")
    downloads: int = Column(Integer, default=0)
    views: int = Column(Integer, default=0)
    purchases: int = Column(Integer, default=0)
    stars: int = Column(Integer, default=0)
    rating: float = Column(Float, default=0.0)
    preview_rows: int = Column(Integer, default=0)
    preview_filecoin_cid: str = Column(String, nullable=True)
    full_filecoin_cid: str = Column(String, nullable=True)
    transaction_hash: str = Column(String, nullable=True)
    block_number: int = Column(Integer, nullable=True)
    metadata_cid: str = Column(String, nullable=True)
    dataset_preview_cid: str = Column(String, nullable=True)
    dataset_cid: str = Column(String, nullable=True)
    generation_lineage = Column(JSON, default={})
    created_at: datetime = Column(DateTime, default=datetime.utcnow)
    updated_at: datetime = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_modified: datetime = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    status: str = Column(
        Enum("draft", "generating", "ready", "failed", "deprecated", name="dataset_status"),
        default="draft",
    )
