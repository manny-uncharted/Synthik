from datetime import datetime
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field as PydanticField, validator, SecretStr, ConfigDict, field_validator, conint, constr
from enum import Enum

# Assuming these enums are correctly defined in app.core.enums.ai_training
from app.core.enums.ai_training import StorageType, TrainingPlatform, JobStatus, ModelStorageType





class UserExternalServiceCredentialBase(BaseModel):
    user_wallet_address: str = PydanticField(..., max_length=128, description="User's wallet address.")
    platform: TrainingPlatform = PydanticField(..., description="The external training platform this credential is for.")
    credential_name: str = PydanticField(..., min_length=3, max_length=100, description="A user-defined name for this credential.")
    additional_config: Optional[Dict[str, Any]] = PydanticField(default_factory=dict, description="Platform-specific additional configuration (e.g., AWS Role ARN, GCP Project ID).")
    
    model_config = ConfigDict(from_attributes=True)


class UserExternalServiceCredentialCreate(UserExternalServiceCredentialBase):
    api_key: Optional[SecretStr] = PydanticField(None, description="API key for the external service.")
    secret_key: Optional[SecretStr] = PydanticField(None, description="Secret key or token for the external service.")


class UserExternalServiceCredentialResponse(UserExternalServiceCredentialBase):
    id: str = PydanticField(..., description="Unique identifier for the credential.")
    has_api_key: bool = PydanticField(False, description="Indicates if an API key is set for this credential.")
    has_secret_key: bool = PydanticField(False, description="Indicates if a secret key is set for this credential.")
    created_at: datetime = PydanticField(..., description="Timestamp of credential creation.")
    updated_at: datetime = PydanticField(..., description="Timestamp of last credential update.")
    # No model_config here as it's inherited


class AITrainingJobBase(BaseModel):
    job_name: str = PydanticField(..., min_length=3, max_length=255, description="User-defined name for the training job.")
    user_wallet_address: str = PydanticField(..., max_length=128, description="User's wallet address initiating the job.")
    processed_dataset_id: str = PydanticField(..., description="ID of the ProcessedDataset to be used for training.")
    platform: TrainingPlatform = PydanticField(..., description="The training platform to run the job on.")
    user_credential_id: Optional[str] = PydanticField(None, description="ID of the UserExternalServiceCredential to use for authentication with the platform (required for non-local platforms).")
    model_type: Optional[str] = PydanticField(None, max_length=100, description="Type or category of the model being trained (e.g., 'text-classification', 'image-generation').")
    hyperparameters: Optional[Dict[str, Any]] = PydanticField(default_factory=dict, description="Hyperparameters for the training job.")
    training_script_config: Optional[Dict[str, Any]] = PydanticField(default_factory=dict, description="Configuration for the training script (e.g., entry_point, instance_type, target_hf_repo_id).")

    model_config = ConfigDict(from_attributes=True)


class AITrainingJobCreate(AITrainingJobBase):
    @validator('user_credential_id', always=True)
    def check_credential_for_external_platform(cls, v, values):
        # Pydantic v2: `values` is now `values.data` in root validators,
        # but for field validators, it refers to the model's fields.
        # Need to access platform from `values.data` if it were a root validator.
        # For a field validator, `values` is a dict of the fields of the model.
        platform = values.get('platform') # Get platform from the model's data
        if platform and platform != TrainingPlatform.LOCAL_SERVER and not v:
            raise ValueError('user_credential_id is required for external (non-local) training platforms.')
        return v


class AITrainingJobResponse(AITrainingJobBase):
    id: str = PydanticField(..., description="Unique identifier for the AI training job.")
    status: JobStatus = PydanticField(..., description="Current status of the training job.")
    external_job_id: Optional[str] = PydanticField(None, description="Job ID from the external training platform.")
    metrics: Optional[Dict[str, Any]] = PydanticField(default_factory=dict, description="Metrics recorded from the training job.")
    output_model_storage_type: Optional[ModelStorageType] = PydanticField(None, description="Storage type of the output model artifact.")
    output_model_url: Optional[str] = PydanticField(None, max_length=2048, description="URL to the output model artifact.")
    huggingface_model_url: Optional[str] = PydanticField(None, max_length=2048, description="URL of the model if uploaded to Hugging Face Hub.")
    logs_url: Optional[str] = PydanticField(None, max_length=2048, description="URL to the job's logs on the training platform.")
    error_message: Optional[str] = PydanticField(None, description="Error message if the job failed.")
    created_at: datetime = PydanticField(..., description="Timestamp of job creation.")
    updated_at: datetime = PydanticField(..., description="Timestamp of last job update.")
    started_at: Optional[datetime] = PydanticField(None, description="Timestamp when the job started running.")
    completed_at: Optional[datetime] = PydanticField(None, description="Timestamp when the job reached a terminal state.")



class TrainingJobStatusUpdate(BaseModel): # Used for webhook payload
    status: JobStatus = PydanticField(..., description="The new status of the job from the external platform.")
    metrics: Optional[Dict[str, Any]] = PydanticField(default_factory=dict, description="Key-value pairs of metrics from the training.")
    external_job_id: Optional[str] = PydanticField(None, description="External platform's job ID (can be used for confirmation or if it changes).")
    output_model_storage_type: Optional[StorageType] = PydanticField(None, description="Storage type of the output model artifact (e.g., S3, GCS).")
    output_model_url: Optional[str] = PydanticField(None, max_length=2048, description="URL to the output model artifact (e.g., S3/GCS URI).")
    logs_url: Optional[str] = PydanticField(None, max_length=2048, description="Direct URL to the job's logs on the platform.")
    error_message: Optional[str] = PydanticField(None, description="Error message if the job failed on the platform.")
    
    @field_validator('output_model_storage_type', mode='before')
    @classmethod
    def normalize_storage_type_from_orm(cls, v: Any) -> Optional[str]:
        print(f"DEBUG: normalize_storage_type_from_orm called with raw value: '{v}' (type: {type(v)})") # DEBUG
        if isinstance(v, Enum):
            original_enum_value = v.value
            processed_value = str(original_enum_value).lower()
            print(f"DEBUG:   Input is Enum. Original ORM enum value: '{original_enum_value}', Processed to lowercase string: '{processed_value}'") # DEBUG
            return processed_value
        if isinstance(v, str):
            processed_value = v.lower()
            print(f"DEBUG:   Input is str. Original string: '{v}', Processed to lowercase string: '{processed_value}'") # DEBUG
            return processed_value
        
        print(f"DEBUG:   Input is neither Enum nor str. Returning as is: '{v}'") # DEBUG
        return v

# This schema was defined in the original prompt for API internal use.
# It might be used for partial updates by an admin or internal system.
class AITrainingJobUpdateInternal(BaseModel):
    status: Optional[JobStatus] = None
    external_job_id: Optional[str] = None
    metrics: Optional[Dict[str, Any]] = None
    output_model_storage_type: Optional[StorageType] = None
    output_model_url: Optional[str] = None
    huggingface_model_url: Optional[str] = None
    logs_url: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None # Allow setting these manually if needed
    completed_at: Optional[datetime] = None


class ModelBase(BaseModel):
    name: constr(min_length=1, max_length=255)
    description: Optional[str]
    provider: constr(min_length=1)
    base_model: constr(min_length=1)
    dataset_id: constr(min_length=1)
    training_config: Dict[str, Any]
    tags: Optional[List[str]] = []

class ModelCreate(ModelBase):
    pass

class TrainingJobInfo(BaseModel):
    id: str
    status: str
    estimatedTime: float

class ModelResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    provider: str
    base_model: str
    dataset_used: str
    dataset_rows: int
    trained_by_id: str
    trained_date: Optional[datetime]
    accuracy: float
    downloads: int
    stars: int
    tags: List[str]
    filecoin_cid: Optional[str]
    status: str
    metrics: Dict[str, Any]
    training_config: Dict[str, Any]
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True

class ModelListResponse(BaseModel):
    models: List[ModelResponse]
    page: int
    limit: int
    total: int
    totalPages: int