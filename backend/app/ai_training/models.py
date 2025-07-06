import uuid
import logging
from datetime import datetime
from typing import Optional
from sqlalchemy import Column, String, Text, DateTime, JSON, func as sql_func, ForeignKey, Index, Enum as SQLEnum, Float, Integer
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.core.types import StringArray
from app.core.enums.ai_training import StorageType, TrainingPlatform, JobStatus, ModelStorageType
from app.ai_training.utils.security import fernet_cipher

logger = logging.getLogger("AItrainingModelDefinitions")





class UserExternalServiceCredential(Base):
    __tablename__ = "user_external_service_credentials"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_wallet_address = Column(String, index=True, nullable=False)
    platform = Column(SQLEnum(TrainingPlatform), nullable=False, index=True)
    credential_name = Column(String, nullable=False)
    encrypted_api_key = Column(Text, nullable=True)
    encrypted_secret_key = Column(Text, nullable=True)
    additional_config = Column(JSON,nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=sql_func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=sql_func.now(), server_default=sql_func.now())
    __table_args__ = (Index("uix_user_platform_credname", "user_wallet_address", "platform", "credential_name", unique=True),)
    training_jobs = relationship("AITrainingJob", back_populates="user_credential")

    def set_api_key(self, api_key: str): self.encrypted_api_key = fernet_cipher.encrypt(api_key.encode()).decode()
    @hybrid_property
    def api_key(self) -> Optional[str]:
        if self.encrypted_api_key:
            try: return fernet_cipher.decrypt(self.encrypted_api_key.encode()).decode()
            except Exception: logger.error(f"Failed to decrypt API key for credential ID {self.id}"); return None
        return None
    def set_secret_key(self, secret_key: str): self.encrypted_secret_key = fernet_cipher.encrypt(secret_key.encode()).decode()
    @hybrid_property
    def secret_key(self) -> Optional[str]:
        if self.encrypted_secret_key:
            try: return fernet_cipher.decrypt(self.encrypted_secret_key.encode()).decode()
            except Exception: logger.error(f"Failed to decrypt secret key for credential ID {self.id}"); return None
        return None



class AITrainingJob(Base):
    __tablename__ = "ai_training_jobs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    job_name = Column(String, index=True, nullable=False)
    user_wallet_address = Column(String, index=True, nullable=False)
    platform = Column(SQLEnum(TrainingPlatform), nullable=False)
    dataset_url = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    user_credential_id = Column(String, ForeignKey("user_external_service_credentials.id"), nullable=True)
    user_credential = relationship("UserExternalServiceCredential", back_populates="training_jobs")
    model_type = Column(String, nullable=True)
    hyperparameters = Column(JSON,nullable=True)
    training_script_config = Column(JSON,nullable=True)
    status = Column(SQLEnum(JobStatus), default=JobStatus.PENDING, nullable=False, index=True)
    external_job_id = Column(String, nullable=True, index=True)
    metrics = Column(JSON,nullable=True)
    output_model_storage_type = Column(SQLEnum(ModelStorageType), nullable=True)
    output_model_url = Column(String, nullable=True)
    huggingface_model_url = Column(String, nullable=True, index=True)
    logs_url = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=sql_func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=sql_func.now(), server_default=sql_func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)



class Model(Base):
    __tablename__ = "models"

    id: str = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: str = Column(String(255), nullable=False)
    user_wallet_address: str = Column(String, index=True, nullable=False)
    description: str = Column(Text, nullable=True)
    provider: str = Column(String(100), nullable=False)
    base_model: str = Column(String(100), nullable=False)
    dataset_used: str = Column(String, nullable=False)
    dataset_rows: int = Column(Integer, default=0)
    trained_by_id: str = Column(String, nullable=False)
    trained_date: datetime = Column(DateTime, nullable=True)
    accuracy: float = Column(Float, default=0.0)
    downloads: int = Column(Integer, default=0)
    stars: int = Column(Integer, default=0)
    tags = Column(StringArray, default=list, nullable=False)
    filecoin_cid: str = Column(String, nullable=True)
    status: str = Column(
        SQLEnum("training", "ready", "failed", "deprecated", name="model_status"),
        default="training",
    )
    metrics = Column(JSON,default={})
    training_config = Column(JSON,default={})
    created_at: datetime = Column(DateTime, default=datetime.utcnow)
    updated_at: datetime = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )