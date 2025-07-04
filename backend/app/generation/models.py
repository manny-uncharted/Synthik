import uuid
from sqlalchemy import (
    Column,
    String,
    Integer,
    Text,
    DateTime,
    Enum,
    ForeignKey,
    JSON
)
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime

from app.core.database import Base


class GenerationJob(Base):
    __tablename__ = "generation_jobs"

    id: str = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    dataset_id: str = Column(String, ForeignKey("datasets.id"), nullable=False)
    user_id: str = Column(String, nullable=False)
    status: str = Column(
        Enum("queued", "running", "completed", "failed", name="generation_job_status"),
        default="queued",
        nullable=False,
    )
    progress: int = Column(Integer, default=0, nullable=False)  # 0–100
    config = Column(JSON, nullable=False)   # store the PreviewConfig/dataset-gen config
    result = Column(JSON, default={}, nullable=False)
    error: str = Column(Text, nullable=True)
    created_at: datetime = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: datetime = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    completed_at: datetime = Column(DateTime, nullable=True)
