import os
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Union, AsyncGenerator

from fastapi import FastAPI, HTTPException, Depends, APIRouter, Body, BackgroundTasks, Header
from pydantic import BaseModel, Field as PydanticField, validator
from sqlalchemy.orm import Session
from sqlalchemy import Column, String, DateTime, JSON as SQLJSON, func as sql_func, ForeignKey, Text, Enum as SQLEnum, Float, Boolean
from sqlalchemy.ext.hybrid import hybrid_property

# --- Security for Credentials ---
from cryptography.fernet import Fernet

# --- Database Setup ---
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base, relationship

# Assuming constants.py contains SQLALCHEMY_DATABASE_URL and REDIS_URL
SQLALCHEMY_DATABASE_URL = os.getenv("SQLALCHEMY_DATABASE_URL", "sqlite:///./ml_ops_api.db") # Use a different DB for this new service
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/1") # Use a different Redis DB number

Base = declarative_base()
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in SQLALCHEMY_DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Redis Setup ---
from redis.asyncio import Redis as AsyncRedis

async def get_redis_pool() -> AsyncRedis:
    return AsyncRedis.from_url(REDIS_URL, decode_responses=True)

redis_client_ml_ops: Optional[AsyncRedis] = None

async def get_redis_ml_ops() -> AsyncRedis:
    global redis_client_ml_ops
    if redis_client_ml_ops is None:
        redis_client_ml_ops = await get_redis_pool()
    return redis_client_ml_ops

try:
    from app.ai_agents.enterprise_workflow import (
        EnterpriseWorkflowManager,
        AppConfig as WFAppConfig, # Workflow AppConfig
        # Tools will be defined conceptually here, actual implementation would be in enterprise_workflow.py or a tools module
        BaseTool as WFBaseTool,
        tool as wf_tool,
        WorkflowDefinition as WFWorkflowDefinition,
    )
except ImportError as e:
    logging.critical(f"Failed to import from enterprise_workflow.py: {e}. API will have limited functionality.")
    # Minimal placeholders if import fails
    class WFBaseTool: pass
    def wf_tool(func): return func
    WFWorkflowDefinition = Dict
    class EnterpriseWorkflowManager:
        def __init__(self, *args, **kwargs): raise NotImplementedError("Workflow system not loaded")
    class WFAppConfig: FASTAPI_BASE_URL = os.getenv("FASTAPI_BASE_URL_CAMPAIGN_API")


# --- Logging ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger("MLOpsAPI")

# --- Configuration ---
WF_CONFIG = WFAppConfig() # For tools needing access to other services like campaign API
# Key for encrypting/decrypting external API keys. STORE THIS SECURELY (e.g., env variable, Vault)
# For demo, generate one. In prod, this MUST be a persistent, securely managed key.
ENCRYPTION_KEY = os.getenv("MLOPS_ENCRYPTION_KEY")
if not ENCRYPTION_KEY:
    logger.warning("MLOPS_ENCRYPTION_KEY not set, generating a temporary one. THIS IS NOT SUITABLE FOR PRODUCTION.")
    ENCRYPTION_KEY = Fernet.generate_key().decode()
fernet_cipher = Fernet(ENCRYPTION_KEY.encode())

# --- ENUMS for DB Models ---
import enum

class StorageType(str, enum.Enum):
    WALRUS = "walrus" # Assuming S3-compatible
    LOCAL_FS = "local_fs"
    GCS = "gcs"
    AZURE_BLOB = "azure_blob"
    HUGGING_FACE = "hugging_face"

class TrainingPlatform(str, enum.Enum):
    LOCAL_SERVER = "local_server"
    HUGGING_FACE = "hugging_face"
    AWS_SAGEMAKER = "aws_sagemaker"
    GOOGLE_VERTEX_AI = "google_vertex_ai"
    LIGHTNING_STUDIOS = "lightning_studios"
    CUSTOM_EXTERNAL = "custom_external" # For other user-defined platforms

class JobStatus(str, enum.Enum):
    PENDING = "pending"
    PREPARING_DATA = "preparing_data"
    SUBMITTED = "submitted" # Submitted to external platform
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    UPDATING_METRICS = "updating_metrics"


# --- Database Models ---
class ProcessedDataset(Base):
    __tablename__ = "processed_datasets"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=True)
    version = Column(String, default="1.0", nullable=False)
    storage_type = Column(SQLEnum(StorageType), nullable=False)
    storage_url = Column(String, nullable=False) # e.g., s3://bucket/path/to/dataset/ or file:///path/
    metadata_ = Column("metadata", SQLJSON, nullable=True) # Preprocessing steps, source campaigns, format, compression etc.
    creator_wallet_address = Column(String, index=True, nullable=True) # Optional: if tied to a user
    created_at = Column(DateTime(timezone=True), server_default=sql_func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=sql_func.now())

    training_jobs = relationship("AITrainingJob", back_populates="processed_dataset")

class UserExternalServiceCredential(Base):
    __tablename__ = "user_external_service_credentials"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_wallet_address = Column(String, index=True, nullable=False)
    platform = Column(SQLEnum(TrainingPlatform), nullable=False, index=True)
    credential_name = Column(String, nullable=False) # e.g., "my-hf-token", "aws-main-profile"
    encrypted_api_key = Column(Text, nullable=True) # Store API keys/tokens encrypted
    encrypted_secret_key = Column(Text, nullable=True) # For services needing key pairs
    additional_config = Column(SQLJSON, nullable=True) # e.g., AWS region, HF username
    created_at = Column(DateTime(timezone=True), server_default=sql_func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=sql_func.now())

    # Unique constraint for user, platform, and credential name
    __table_args__ = (Index("uix_user_platform_credname", "user_wallet_address", "platform", "credential_name", unique=True),)

    training_jobs = relationship("AITrainingJob", back_populates="user_credential")

    def set_api_key(self, api_key: str):
        self.encrypted_api_key = fernet_cipher.encrypt(api_key.encode()).decode()

    @hybrid_property
    def api_key(self) -> Optional[str]:
        if self.encrypted_api_key:
            try:
                return fernet_cipher.decrypt(self.encrypted_api_key.encode()).decode()
            except Exception: # Handle cases where decryption might fail (e.g. key rotation)
                logger.error(f"Failed to decrypt API key for credential ID {self.id}")
                return None
        return None

    def set_secret_key(self, secret_key: str):
        self.encrypted_secret_key = fernet_cipher.encrypt(secret_key.encode()).decode()

    @hybrid_property
    def secret_key(self) -> Optional[str]:
        if self.encrypted_secret_key:
            try:
                return fernet_cipher.decrypt(self.encrypted_secret_key.encode()).decode()
            except Exception:
                logger.error(f"Failed to decrypt secret key for credential ID {self.id}")
                return None
        return None


class AITrainingJob(Base):
    __tablename__ = "ai_training_jobs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    job_name = Column(String, index=True, nullable=False)
    user_wallet_address = Column(String, index=True, nullable=False) # User who initiated
    
    processed_dataset_id = Column(String, ForeignKey("processed_datasets.id"), nullable=False)
    processed_dataset = relationship("ProcessedDataset", back_populates="training_jobs")

    platform = Column(SQLEnum(TrainingPlatform), nullable=False)
    user_credential_id = Column(String, ForeignKey("user_external_service_credentials.id"), nullable=True) # If external platform needs creds
    user_credential = relationship("UserExternalServiceCredential", back_populates="training_jobs")

    model_type = Column(String, nullable=True) # e.g., "bert-base-uncased", "custom-cnn"
    hyperparameters = Column(SQLJSON, nullable=True)
    training_script_config = Column(SQLJSON, nullable=True) # Config for local script or external job definition

    status = Column(SQLEnum(JobStatus), default=JobStatus.PENDING, nullable=False, index=True)
    external_job_id = Column(String, nullable=True, index=True) # ID from HuggingFace, SageMaker, etc.
    
    metrics = Column(SQLJSON, nullable=True) # e.g., {"epoch_1_loss": 0.5, "epoch_1_accuracy": 0.8}
    output_model_storage_type = Column(SQLEnum(StorageType), nullable=True)
    output_model_url = Column(String, nullable=True) # Where the trained model is stored
    logs_url = Column(String, nullable=True) # Link to training logs

    error_message = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=sql_func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=sql_func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

Base.metadata.create_all(bind=engine)


# --- Pydantic Schemas for MLOps API ---
class ProcessedDatasetCreate(BaseModel):
    name: str
    description: Optional[str] = None
    version: Optional[str] = "1.0"
    storage_type: StorageType
    storage_url: str # Should be validated as a URL
    metadata_: Optional[Dict[str, Any]] = PydanticField(default_factory=dict, alias="metadata")
    creator_wallet_address: Optional[str] = None

class ProcessedDatasetResponse(ProcessedDatasetCreate):
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True
        use_enum_values = True # Ensure enums are serialized as their values

class UserExternalServiceCredentialCreate(BaseModel):
    user_wallet_address: str
    platform: TrainingPlatform
    credential_name: str
    api_key: Optional[str] = None # Will be encrypted before saving
    secret_key: Optional[str] = None # Will be encrypted
    additional_config: Optional[Dict[str, Any]] = None

class UserExternalServiceCredentialResponse(BaseModel):
    id: str
    user_wallet_address: str
    platform: TrainingPlatform
    credential_name: str
    # DO NOT return api_key or secret_key, even placeholder like "********"
    has_api_key: bool = False # Indicate if a key is set without exposing it
    has_secret_key: bool = False
    additional_config: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True
        use_enum_values = True

class AITrainingJobCreate(BaseModel):
    job_name: str
    user_wallet_address: str
    processed_dataset_id: str
    platform: TrainingPlatform
    user_credential_id: Optional[str] = None # Required if platform is not LOCAL_SERVER
    model_type: Optional[str] = None
    hyperparameters: Optional[Dict[str, Any]] = None
    training_script_config: Optional[Dict[str, Any]] = None # For local or detailed external config

    @validator('user_credential_id', always=True)
    def check_credential_for_external_platform(cls, v, values):
        if 'platform' in values and values['platform'] != TrainingPlatform.LOCAL_SERVER and not v:
            raise ValueError('user_credential_id is required for external training platforms.')
        return v

class AITrainingJobResponse(BaseModel):
    id: str
    job_name: str
    user_wallet_address: str
    processed_dataset_id: str
    platform: TrainingPlatform
    user_credential_id: Optional[str] = None
    model_type: Optional[str] = None
    hyperparameters: Optional[Dict[str, Any]] = None
    training_script_config: Optional[Dict[str, Any]] = None
    status: JobStatus
    external_job_id: Optional[str] = None
    metrics: Optional[Dict[str, Any]] = None
    output_model_storage_type: Optional[StorageType] = None
    output_model_url: Optional[str] = None
    logs_url: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    class Config:
        from_attributes = True
        use_enum_values = True

class TrainingJobStatusUpdate(BaseModel):
    status: JobStatus
    metrics: Optional[Dict[str, Any]] = None
    external_job_id: Optional[str] = None # Can be updated if obtained later
    output_model_storage_type: Optional[StorageType] = None
    output_model_url: Optional[str] = None
    logs_url: Optional[str] = None
    error_message: Optional[str] = None
    # Include a secret for webhook authentication
    webhook_secret: Optional[str] = PydanticField(default=None, description="Secret for authenticating webhook calls.")

# --- Conceptual Tools for AI Training Workflows ---
# These would be implemented in enterprise_workflow.py or a dedicated tools module.

class WalrusStorageTool(WFBaseTool):
    name: str = "walrus_storage_tool"
    description: str = "Uploads or downloads data to/from Walrus (S3-compatible) storage."
    # Needs S3 client (boto3) and credentials configured (e.g., from environment)
    def _run(self, action: str, bucket: str, key: str, local_file_path: Optional[str] = None) -> Dict[str, Any]:
        logger.info(f"WalrusStorageTool: {action} for bucket='{bucket}', key='{key}'")
        # Placeholder for boto3 S3 interaction
        # if action == "upload": s3.upload_file(local_file_path, bucket, key)
        # if action == "download": s3.download_file(bucket, key, local_file_path)
        # if action == "get_presigned_url": return {"url": s3.generate_presigned_url(...)}
        return {"status": "mocked_success", "action": action, "url": f"s3://{bucket}/{key}"}
    async def _arun(self, action: str, bucket: str, key: str, local_file_path: Optional[str] = None) -> Dict[str, Any]:
        return self._run(action, bucket, key, local_file_path)

class DataPreprocessorTool(WFBaseTool):
    name: str = "data_preprocessor_tool"
    description: str = "Executes data preprocessing scripts or steps on specified input data."
    def _run(self, input_data_path: str, output_data_path: str, processing_config: Dict[str, Any]) -> Dict[str, Any]:
        logger.info(f"DataPreprocessorTool: Processing {input_data_path} with config {processing_config}")
        # Placeholder: In reality, this would call a subprocess, a container, or a library function
        # e.g., os.system(f"python preprocess.py --input {input_data_path} --output {output_data_path} --config '{json.dumps(processing_config)}'")
        return {"status": "mocked_success", "output_path": output_data_path, "message": "Preprocessing mocked."}
    async def _arun(self, input_data_path: str, output_data_path: str, processing_config: Dict[str, Any]) -> Dict[str, Any]:
        return self._run(input_data_path, output_data_path, processing_config)

class TrainingSchedulerTool(WFBaseTool):
    name: str = "training_scheduler_tool"
    description: str = "Schedules and triggers AI model training jobs on specified platforms."
    # This tool would need access to the MLOpsAPI's DB or its internal service methods to create AITrainingJob records
    # and interact with external platform SDKs (HuggingFace Hub, Boto3 for SageMaker, Google AI Platform SDKs).
    def _run(self, job_create_payload: Dict[str, Any]) -> Dict[str, Any]: # Corresponds to AITrainingJobCreate
        logger.info(f"TrainingSchedulerTool: Received job creation payload: {job_create_payload}")
        # 1. Validate payload
        # 2. Create AITrainingJob record in DB (status: PENDING or SUBMITTED) - this might be an API call back to MLOpsAPI
        # 3. If platform is LOCAL_SERVER:
        #    - Trigger local script (e.g., via subprocess, or add to a local job queue)
        # 4. If external platform (HuggingFace, AWS, etc.):
        #    - Fetch credentials using job_create_payload.user_credential_id
        #    - Use platform-specific SDK to submit the job
        #    - Store external_job_id in AITrainingJob record
        # This is a complex tool. For now, it's a high-level placeholder.
        job_id = str(uuid.uuid4()) # Mocked job ID
        external_job_id = f"ext_{str(uuid.uuid4())[:8]}" if job_create_payload.get("platform") != "local_server" else None
        logger.info(f"Mocking training job submission for platform {job_create_payload.get('platform')}. Internal Job ID: {job_id}, External Job ID: {external_job_id}")
        return {"status": "mocked_job_submitted", "internal_job_id": job_id, "external_job_id": external_job_id, "platform": job_create_payload.get("platform")}
    async def _arun(self, job_create_payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._run(job_create_payload)

# --- FastAPI App and MLOps Router ---
app_ml_ops = FastAPI(
    title="MLOps API for AI Training & Data Management",
    description="Manages processed datasets, AI training jobs, and external service credentials.",
    version="1.0.0"
)
ml_ops_router = APIRouter(prefix="/mlops", tags=["AI/ML Operations"])


# --- Processed Datasets Endpoints ---
@ml_ops_router.post("/datasets", response_model=ProcessedDatasetResponse, status_code=201)
async def create_processed_dataset(
    dataset_in: ProcessedDatasetCreate,
    db: Session = Depends(get_db),
    redis: AsyncRedis = Depends(get_redis_ml_ops)
):
    db_dataset = ProcessedDataset(**dataset_in.model_dump(by_alias=True)) # Use model_dump for alias handling
    db.add(db_dataset)
    try:
        db.commit()
        db.refresh(db_dataset)
        # Cache dataset info
        await redis.set(f"dataset:{db_dataset.id}", json.dumps(ProcessedDatasetResponse.from_orm(db_dataset).model_dump_json()), ex=3600)
        return ProcessedDatasetResponse.from_orm(db_dataset)
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating processed dataset: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not save dataset: {str(e)}")

@ml_ops_router.get("/datasets/{dataset_id}", response_model=ProcessedDatasetResponse)
async def get_processed_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
    redis: AsyncRedis = Depends(get_redis_ml_ops)
):
    cached_dataset = await redis.get(f"dataset:{dataset_id}")
    if cached_dataset:
        logger.info(f"Cache HIT for dataset: {dataset_id}")
        return ProcessedDatasetResponse.model_validate_json(cached_dataset)
    
    db_dataset = db.query(ProcessedDataset).filter(ProcessedDataset.id == dataset_id).first()
    if not db_dataset:
        raise HTTPException(status_code=404, detail="Processed dataset not found")
    
    response_model = ProcessedDatasetResponse.from_orm(db_dataset)
    await redis.set(f"dataset:{db_dataset.id}", response_model.model_dump_json(), ex=3600)
    return response_model

@ml_ops_router.get("/datasets", response_model=List[ProcessedDatasetResponse])
async def list_processed_datasets(
    creator_wallet_address: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = db.query(ProcessedDataset)
    if creator_wallet_address:
        query = query.filter(ProcessedDataset.creator_wallet_address == creator_wallet_address)
    datasets = query.order_by(ProcessedDataset.created_at.desc()).offset(skip).limit(limit).all()
    return [ProcessedDatasetResponse.from_orm(ds) for ds in datasets]


# --- User External Service Credentials Endpoints ---
@ml_ops_router.post("/user-credentials", response_model=UserExternalServiceCredentialResponse, status_code=201)
async def create_user_credential(
    cred_in: UserExternalServiceCredentialCreate,
    db: Session = Depends(get_db)
):
    # Check for existing credential with the same name for the user and platform
    existing_cred = db.query(UserExternalServiceCredential).filter_by(
        user_wallet_address=cred_in.user_wallet_address,
        platform=cred_in.platform,
        credential_name=cred_in.credential_name
    ).first()
    if existing_cred:
        raise HTTPException(status_code=409, detail="Credential with this name already exists for the user and platform.")

    db_cred = UserExternalServiceCredential(
        user_wallet_address=cred_in.user_wallet_address,
        platform=cred_in.platform,
        credential_name=cred_in.credential_name,
        additional_config=cred_in.additional_config
    )
    if cred_in.api_key:
        db_cred.set_api_key(cred_in.api_key)
    if cred_in.secret_key:
        db_cred.set_secret_key(cred_in.secret_key)
    
    db.add(db_cred)
    try:
        db.commit()
        db.refresh(db_cred)
        response_data = UserExternalServiceCredentialResponse.from_orm(db_cred).model_dump()
        response_data["has_api_key"] = bool(db_cred.encrypted_api_key)
        response_data["has_secret_key"] = bool(db_cred.encrypted_secret_key)
        return UserExternalServiceCredentialResponse(**response_data)
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating user credential: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not save credential: {str(e)}")

@ml_ops_router.get("/user-credentials/{credential_id}", response_model=UserExternalServiceCredentialResponse)
async def get_user_credential(credential_id: str, db: Session = Depends(get_db)):
    db_cred = db.query(UserExternalServiceCredential).filter(UserExternalServiceCredential.id == credential_id).first()
    if not db_cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    response_data = UserExternalServiceCredentialResponse.from_orm(db_cred).model_dump()
    response_data["has_api_key"] = bool(db_cred.encrypted_api_key)
    response_data["has_secret_key"] = bool(db_cred.encrypted_secret_key)
    return UserExternalServiceCredentialResponse(**response_data)

@ml_ops_router.get("/user-credentials/by-user/{user_wallet_address}", response_model=List[UserExternalServiceCredentialResponse])
async def list_user_credentials(user_wallet_address: str, db: Session = Depends(get_db)):
    creds = db.query(UserExternalServiceCredential).filter(UserExternalServiceCredential.user_wallet_address == user_wallet_address).all()
    response_list = []
    for db_cred in creds:
        response_data = UserExternalServiceCredentialResponse.from_orm(db_cred).model_dump()
        response_data["has_api_key"] = bool(db_cred.encrypted_api_key)
        response_data["has_secret_key"] = bool(db_cred.encrypted_secret_key)
        response_list.append(UserExternalServiceCredentialResponse(**response_data))
    return response_list

@ml_ops_router.delete("/user-credentials/{credential_id}", status_code=204)
async def delete_user_credential(credential_id: str, db: Session = Depends(get_db)):
    db_cred = db.query(UserExternalServiceCredential).filter(UserExternalServiceCredential.id == credential_id).first()
    if not db_cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    # Check if credential is in use by any active training jobs (optional, for safety)
    active_jobs = db.query(AITrainingJob).filter(
        AITrainingJob.user_credential_id == credential_id,
        AITrainingJob.status.in_([JobStatus.PENDING, JobStatus.RUNNING, JobStatus.QUEUED, JobStatus.SUBMITTED])
    ).count()
    if active_jobs > 0:
        raise HTTPException(status_code=400, detail=f"Credential is in use by {active_jobs} active training job(s). Cannot delete.")
    
    db.delete(db_cred)
    db.commit()
    return # No content

# --- AI Training Jobs Endpoints ---
@ml_ops_router.post("/training-jobs", response_model=AITrainingJobResponse, status_code=201)
async def create_training_job(
    job_in: AITrainingJobCreate,
    background_tasks: BackgroundTasks, # For triggering the actual job submission
    db: Session = Depends(get_db)
):
    # Validate dataset exists
    dataset = db.query(ProcessedDataset).filter(ProcessedDataset.id == job_in.processed_dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail=f"ProcessedDataset with ID {job_in.processed_dataset_id} not found.")

    # Validate credential exists if provided
    if job_in.user_credential_id:
        credential = db.query(UserExternalServiceCredential).filter(UserExternalServiceCredential.id == job_in.user_credential_id).first()
        if not credential:
            raise HTTPException(status_code=404, detail=f"UserExternalServiceCredential with ID {job_in.user_credential_id} not found.")
        if credential.platform != job_in.platform:
            raise HTTPException(status_code=400, detail=f"Credential platform '{credential.platform.value}' does not match job platform '{job_in.platform.value}'.")
        if credential.user_wallet_address != job_in.user_wallet_address:
             raise HTTPException(status_code=403, detail="Credential does not belong to the job's user.")


    db_job = AITrainingJob(**job_in.model_dump())
    db_job.status = JobStatus.PENDING # Initial status
    
    db.add(db_job)
    try:
        db.commit()
        db.refresh(db_job)
        
        # Add a background task to actually submit/schedule the job
        # This task would use the TrainingSchedulerTool's logic (or direct SDK calls)
        # background_tasks.add_task(submit_training_job_to_platform, job_id=db_job.id, db_provider=get_db) # Pass db provider
        logger.info(f"AITrainingJob record created: {db_job.id}. Actual submission would be a background task.")
        # For now, we are not running the background task to keep this example contained.
        # In a real system, the following would happen in the background task:
        # 1. Update job status to SUBMITTED/QUEUED.
        # 2. Call external service or local script.
        # 3. Store external_job_id.
        
        return AITrainingJobResponse.from_orm(db_job)
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating AI training job: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not save training job: {str(e)}")

@ml_ops_router.get("/training-jobs/{job_id}", response_model=AITrainingJobResponse)
async def get_training_job(job_id: str, db: Session = Depends(get_db)):
    db_job = db.query(AITrainingJob).filter(AITrainingJob.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Training job not found")
    return AITrainingJobResponse.from_orm(db_job)

@ml_ops_router.get("/training-jobs/by-user/{user_wallet_address}", response_model=List[AITrainingJobResponse])
async def list_training_jobs_by_user(
    user_wallet_address: str,
    status: Optional[JobStatus] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = db.query(AITrainingJob).filter(AITrainingJob.user_wallet_address == user_wallet_address)
    if status:
        query = query.filter(AITrainingJob.status == status)
    jobs = query.order_by(AITrainingJob.created_at.desc()).offset(skip).limit(limit).all()
    return [AITrainingJobResponse.from_orm(job) for job in jobs]

@ml_ops_router.post("/training-jobs/{job_id}/status-update-webhook", response_model=AITrainingJobResponse)
async def training_job_webhook_update(
    job_id: str,
    update_data: TrainingJobStatusUpdate,
    # For security, webhook should be authenticated.
    # x_webhook_signature: Optional[str] = Header(None), # Example for signature auth
    db: Session = Depends(get_db)
):
    # IMPORTANT: Authenticate this webhook call in a real system!
    # E.g., using a shared secret, signature verification.
    # if not verify_webhook_secret(update_data.webhook_secret, job_id):
    #     raise HTTPException(status_code=403, detail="Invalid webhook secret or authentication failed.")

    db_job = db.query(AITrainingJob).filter(AITrainingJob.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Training job not found for webhook update.")

    logger.info(f"Webhook update for job {job_id}: status={update_data.status}, metrics={update_data.metrics is not None}")
    
    db_job.status = update_data.status
    if update_data.metrics:
        if db_job.metrics: # Merge if existing metrics
            db_job.metrics.update(update_data.metrics)
        else:
            db_job.metrics = update_data.metrics
    if update_data.external_job_id:
        db_job.external_job_id = update_data.external_job_id
    if update_data.output_model_storage_type:
        db_job.output_model_storage_type = update_data.output_model_storage_type
    if update_data.output_model_url:
        db_job.output_model_url = update_data.output_model_url
    if update_data.logs_url:
        db_job.logs_url = update_data.logs_url
    if update_data.error_message:
        db_job.error_message = update_data.error_message

    if update_data.status in [JobStatus.RUNNING] and not db_job.started_at:
        db_job.started_at = datetime.now(timezone.utc)
    if update_data.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]:
        db_job.completed_at = datetime.now(timezone.utc)
    
    db_job.updated_at = datetime.now(timezone.utc) # Explicitly set for onupdate to work reliably on all DBs for JSON changes

    try:
        db.commit()
        db.refresh(db_job)
        return AITrainingJobResponse.from_orm(db_job)
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating job {job_id} via webhook: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not update job status: {str(e)}")


# Include the MLOps router in the main app
app_ml_ops.include_router(ml_ops_router)

# Lifespan events for Redis client
@app_ml_ops.on_event("startup")
async def startup_event_ml_ops():
    global redis_client_ml_ops
    redis_client_ml_ops = await get_redis_pool()
    logger.info("MLOps API Redis client initialized.")

@app_ml_ops.on_event("shutdown")
async def shutdown_event_ml_ops():
    global redis_client_ml_ops
    if redis_client_ml_ops:
        await redis_client_ml_ops.close()
        logger.info("MLOps API Redis client closed.")

# --- Main Entry Point (for running with Uvicorn) ---
if __name__ == "__main__":
    import uvicorn
    logger.info("Starting Uvicorn server for MLOps API on http://localhost:8002")
    # Ensure environment variables (SQLALCHEMY_DATABASE_URL, REDIS_URL, MLOPS_ENCRYPTION_KEY,
    # GOOGLE_API_KEY, ATOMASDK_BEARER_AUTH, FASTAPI_BASE_URL_CAMPAIGN_API) are set.
    if not os.getenv("FASTAPI_BASE_URL_CAMPAIGN_API"):
         logger.warning("FASTAPI_BASE_URL_CAMPAIGN_API (for CampaignDataTool) is not set. Set this environment variable if needed.")
    if not ENCRYPTION_KEY or ENCRYPTION_KEY == Fernet.generate_key().decode(): # Check if it's the default generated one
        logger.critical("MLOPS_ENCRYPTION_KEY is not set or is temporary. SET A PERSISTENT, SECURE KEY FOR PRODUCTION.")

    uvicorn.run(app_ml_ops, host="0.0.0.0", port=8002)
