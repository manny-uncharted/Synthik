import uuid
import logging
from typing import Optional
from sqlalchemy import Column, String, Text, DateTime, JSON as SQLJSON, func as sql_func, ForeignKey, Index, Enum as SQLEnum
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base
from app.core.enums.ai_training import StorageType, TrainingPlatform, JobStatus, ModelStorageType
from app.ai_training.utils.security import fernet_cipher

logger = logging.getLogger("AItrainingModelDefinitions")


class ProcessedDataset(Base):
    __tablename__ = "processed_datasets"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=True)
    campaign_id = Column(String, ForeignKey("campaigns.id"), nullable=True)
    onchain_campaign_id = Column(String, nullable=True)
    version = Column(String, default="1.0", nullable=False)
    storage_type = Column(SQLEnum(StorageType), nullable=False)
    storage_url = Column(String, nullable=False)
    metadata_ = Column("metadata", JSONB, nullable=True)
    creator_wallet_address = Column(String, index=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=sql_func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=sql_func.now(), server_default=sql_func.now())
    training_jobs = relationship("AITrainingJob", back_populates="processed_dataset")

    campaign = relationship("Campaign", back_populates="processed_datasets")



class UserExternalServiceCredential(Base):
    __tablename__ = "user_external_service_credentials"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_wallet_address = Column(String, index=True, nullable=False)
    platform = Column(SQLEnum(TrainingPlatform), nullable=False, index=True)
    credential_name = Column(String, nullable=False)
    encrypted_api_key = Column(Text, nullable=True)
    encrypted_secret_key = Column(Text, nullable=True)
    additional_config = Column(JSONB, nullable=True)
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
    processed_dataset_id = Column(String, ForeignKey("processed_datasets.id"), nullable=False)
    processed_dataset = relationship("ProcessedDataset", back_populates="training_jobs")
    platform = Column(SQLEnum(TrainingPlatform), nullable=False)
    user_credential_id = Column(String, ForeignKey("user_external_service_credentials.id"), nullable=True)
    user_credential = relationship("UserExternalServiceCredential", back_populates="training_jobs")
    model_type = Column(String, nullable=True)
    hyperparameters = Column(JSONB, nullable=True)
    training_script_config = Column(JSONB, nullable=True)
    status = Column(SQLEnum(JobStatus), default=JobStatus.PENDING, nullable=False, index=True)
    external_job_id = Column(String, nullable=True, index=True)
    metrics = Column(JSONB, nullable=True)
    output_model_storage_type = Column(SQLEnum(ModelStorageType), nullable=True)
    output_model_url = Column(String, nullable=True)
    huggingface_model_url = Column(String, nullable=True, index=True)
    logs_url = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=sql_func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=sql_func.now(), server_default=sql_func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)