# mlops_sdk/models.py

from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from enum import Enum

class TrainingPlatform(str, Enum):
    LOCAL_SERVER = "LOCAL_SERVER"
    AWS_SAGEMAKER = "AWS_SAGEMAKER"
    GOOGLE_VERTEX_AI = "GOOGLE_VERTEX_AI"
    HUGGING_FACE = "HUGGING_FACE"

class TrainingJobCreate(BaseModel):
    job_name: str
    user_wallet_address: str
    processed_dataset_id: str
    platform: TrainingPlatform
    user_credential_id: Optional[str]
    model_type: Optional[str]
    hyperparameters: Dict[str, Any] = Field(default_factory=dict)
    training_script_config: Dict[str, Any] = Field(default_factory=dict)

class TrainingJobResponse(TrainingJobCreate):
    id: str
    status: str
    external_job_id: Optional[str]
    metrics: Dict[str, Any]
    output_model_storage_type: Optional[str]
    output_model_url: Optional[str]
    huggingface_model_url: Optional[str]
    logs_url: Optional[str]
    error_message: Optional[str]
    created_at: str
    updated_at: str
    started_at: Optional[str]
    completed_at: Optional[str]

class TrainingJobStatus(BaseModel):
    id: str
    status: str



class UserCredCreate(BaseModel):
    user_wallet_address: str
    platform: TrainingPlatform
    credential_name: str
    api_key: Optional[str]
    secret_key: Optional[str]
    additional_config: Dict[str, Any] = Field(default_factory=dict)


class UserCredResponse(UserCredCreate):
    id: str
    created_at: str
    updated_at: str