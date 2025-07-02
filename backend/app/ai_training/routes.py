import os
import logging
import uuid
import tempfile
import mimetypes
import shutil
import httpx
from pathlib import Path
from redis.asyncio import Redis as AsyncRedis
from datetime import datetime, timezone
from typing import List, Dict, Optional

from fastapi import FastAPI, HTTPException, Depends, APIRouter, Body, BackgroundTasks, Header, status
from pydantic import BaseModel, Field as PydanticField, validator, SecretStr
from sqlalchemy.orm import Session

# --- Security for Credentials ---
from cryptography.fernet import Fernet
import hmac
import hashlib

# --- HTTP Client for Tools ---
import httpx # For asynchronous HTTP requests in tools

from app.ai_training.utils.security import fernet_cipher
from app.core.redis import get_redis_ml_ops, get_redis_pool
from app.core.database import get_session, get_session_with_ctx_manager
from app.core.constants import MLOPS_ENCRYPTION_KEY, FASTAPI_BASE_URL_CAMPAIGN_API, HUGGING_FACE_HUB_TOKEN_MLOPS, AWS_ACCESS_KEY_ID_MLOPS, AWS_SECRET_ACCESS_KEY_MLOPS, AWS_REGION_MLOPS, WEBHOOK_SHARED_SECRET
from app.ai_training.models import ProcessedDataset, UserExternalServiceCredential, TrainingPlatform, AITrainingJob
from app.core.enums.ai_training import StorageType, JobStatus, TrainingPlatform
from app.ai_training.schemas import ProcessedDatasetCreate, ProcessedDatasetResponse, UserExternalServiceCredentialCreate, UserExternalServiceCredentialResponse, AITrainingJobCreate, AITrainingJobResponse, TrainingJobStatusUpdate
from app.ai_training.utils.toolkit import WalrusStorageTool, DataPreprocessorTool
from app.ai_training.services import submit_training_job_to_platform
from app.campaigns.models import Campaign, Contribution
from app.storage.walrus import WalrusClient

try:
    from app.ai_agents.enterprise_workflow import (
        BaseTool as WFBaseTool,
    )
except ImportError as e:
    logging.critical(f"Failed to import from enterprise_workflow.py: {e}. API will have limited functionality.")
    class WFBaseTool: pass
    def wf_tool(func): return func
    WFWorkflowDefinition = Dict
    class EnterpriseWorkflowManager:
        def __init__(self, *args, **kwargs): raise NotImplementedError("Workflow system not loaded")
    class WFAppConfig: 
        FASTAPI_BASE_URL = FASTAPI_BASE_URL_CAMPAIGN_API
        HUGGING_FACE_HUB_TOKEN = HUGGING_FACE_HUB_TOKEN_MLOPS
        AWS_ACCESS_KEY_ID = AWS_ACCESS_KEY_ID_MLOPS
        AWS_SECRET_ACCESS_KEY = AWS_SECRET_ACCESS_KEY_MLOPS
        AWS_REGION = AWS_REGION_MLOPS


# --- Logging ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger("MLOpsAPI_v2") # Updated logger name

WALRUS_AGGREGATOR_BLOB_URL_PREFIX = "https://aggregator.walrus-testnet.walrus.space/v1/blobs"
WALRUS_PUBLISHER_BLOB_URL_PREFIX = "https://publisher.walrus-testnet.walrus.space/v1/blobs"



ml_ops_router = APIRouter(prefix="/mlops", tags=["AI/ML Operations"])


async def _extract_text_from_file(file_path: Path, original_file_type: Optional[str]) -> Optional[str]:
    """
    Placeholder function to extract text from a file.
    Implement actual extraction based on file types (TXT, PDF, CSV, etc.).
    """
    logger.info(f"Attempting to extract text from '{file_path}' (original type: {original_file_type})")
    ext = ""
    if original_file_type:
        if original_file_type.startswith("."):
            ext = original_file_type.lower()
        else:
            guessed = mimetypes.guess_extension(original_file_type) # Convert MIME to extension
            if guessed:
                ext = guessed.lower()
    
    if not ext and file_path.suffix: # Fallback to file's own extension if known
        ext = file_path.suffix.lower()

    try:
        if ext == ".txt":
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()
        elif ext == ".pdf":
            # Replace with actual PDF text extraction logic (e.g., using pdfplumber)
            logger.warning(f"PDF text extraction for '{file_path}' is a placeholder.")
            return f"[Placeholder: Extracted text from PDF: {file_path.name}]"
        elif ext == ".csv":
            # Replace with actual CSV processing logic
            logger.warning(f"CSV processing for '{file_path}' is a placeholder.")
            return f"[Placeholder: Extracted text from CSV: {file_path.name}]"
        # Add more file types as needed
        else:
            logger.warning(f"Unsupported file type '{ext}' for text extraction from '{file_path}'.")
            return f"[Placeholder: Content from {file_path.name} - Type: {ext}]" # Return placeholder for other types
    except Exception as e:
        logger.error(f"Error extracting text from '{file_path}': {e}")
        return None

# --- Processed Datasets Endpoints (Copied from previous, minor adjustments) ---
@ml_ops_router.post("/datasets", response_model=ProcessedDatasetResponse, status_code=status.HTTP_201_CREATED)
async def create_processed_dataset(
    dataset_in: ProcessedDatasetCreate,
    db: Session = Depends(get_session),
):
    try:
        if dataset_in.onchain_campaign_id:
            campaign = db.query(Campaign).filter(Campaign.onchain_campaign_id == dataset_in.onchain_campaign_id).first()
            print(f"Campaign: {campaign}")
            if not campaign:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
        
        if dataset_in.creator_wallet_address == campaign.creator_wallet_address:
            # 1. Get the contributions that match the campaign
            contributions = db.query(Contribution).filter(Contribution.campaign_id == campaign.id).all()

            # 2. Extract the file type from the contributions
            file_type = contributions[0].file_type

            # 3. Extract the data_urls from the contributions
            data_urls = [contrib.data_url for contrib in contributions]

            # 4. Strip the data_urls to get the blob_ids
            blob_ids = [url.split("/")[-1] for url in data_urls]

            # --- Step 5: Download and extract the contents ---
            all_extracted_texts: List[str] = []
            temp_download_dir: Optional[str] = None
            temp_upload_file_path: Optional[Path] = None

            try:
                temp_download_dir = tempfile.mkdtemp(prefix="dataset_dl_")
                logger.info(f"Created temporary download directory: {temp_download_dir}")
                
                # Initialize WalrusClient (ensure it's configured, possibly via Depends or global)
                # For this example, direct instantiation. In a real app, manage its lifecycle.
                async with WalrusClient() as walrus_client:
                    for contrib in contributions:
                        print(f"Contribution: {contrib}")
                        if not contrib.data_url:
                            logger.warning(f"Contribution {contrib.id} (onchain: {contrib.onchain_contribution_id}) has no data_url, skipping.")
                            continue
                        
                        # Step 4 (implicitly): Get blob_id from data_url
                        blob_id = contrib.data_url.split("/")[-1]
                        if not blob_id:
                            logger.warning(f"Could not extract blob_id from data_url '{contrib.data_url}' for contribution {contrib.id}, skipping.")
                            continue

                        # Define a unique path for each downloaded temp file
                        # Using a generic name as original filename from Walrus might not be easily available here
                        temp_blob_path = Path(temp_download_dir) / f"temp_{blob_id}_{uuid.uuid4().hex}"

                        try:
                            logger.info(f"Processing blob: {blob_id} from contribution {contrib.campaign_id}")
                            await walrus_client.read_blob(blob_id=blob_id, output_path=temp_blob_path)
                            
                            # Step 2 (implicitly): Get file_type for this specific contribution
                            text_content = await _extract_text_from_file(temp_blob_path, contrib.file_type)
                            if text_content:
                                all_extracted_texts.append(text_content)
                            else:
                                logger.info(f"No text content extracted from blob {blob_id} (type: {contrib.file_type})")
                        except Exception as e:
                            logger.error(f"Failed to download or extract content from blob {blob_id} (Contribution: {contrib.campaign_id}): {e}", exc_info=True)
                            # Decide error handling: skip this file or fail the whole dataset creation
                            # For this example, we'll skip and log.
                            continue
                    
                    if not all_extracted_texts:
                        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No text content could be extracted from any of the contributions.")

                    # --- Step 6: Save dataset_content to Walrus ---
                    dataset_content_str = "\n\n--- Document Separator ---\n\n".join(all_extracted_texts)
                    
                    output_dataset_file_ext = ".txt" # Define the output type for the combined dataset
                    # Sanitize campaign.title for use in a filename
                    sane_dataset_name = "".join(c if c.isalnum() or c in (' ', '_', '-') else '_' for c in campaign.title).replace(' ', '_')
                    output_dataset_filename = f"processed_{sane_dataset_name}_{campaign.id}{output_dataset_file_ext}"

                    # Write combined content to a new temporary file before uploading
                    with tempfile.NamedTemporaryFile(mode="w", suffix=output_dataset_file_ext, delete=False, encoding='utf-8') as tmp_file:
                        tmp_file.write(dataset_content_str)
                        temp_upload_file_path = Path(tmp_file.name)
                    
                    logger.info(f"Combined dataset content written to temporary file: {temp_upload_file_path}")

                    new_blob_info = await walrus_client.store_blob(data=temp_upload_file_path)
                    print(f"new_blob_info: {new_blob_info}")
                    print(f"new_blob_info_blob_id: {new_blob_info['newlyCreated']['blobObject']['blobId']}")
                    # Log the full response to help with debugging if structure changes or issues persist
                    logger.info(f"Response from walrus_client.store_blob: {new_blob_info}") 
                    
                    public_blob_id: Optional[str] = None # Initialize to None

                    # Safely navigate the nested structure to get the public blobId
                    if (new_blob_info and 
                        isinstance(new_blob_info, dict) and
                        new_blob_info.get('newlyCreated') and 
                        isinstance(new_blob_info['newlyCreated'], dict) and
                        new_blob_info['newlyCreated'].get('blobObject') and
                        isinstance(new_blob_info['newlyCreated']['blobObject'], dict)):
                        
                        public_blob_id = new_blob_info['newlyCreated']['blobObject'].get('blobId')
                        print(f"fetched public_blob_id: {public_blob_id}")

                    if not public_blob_id: 
                        logger.error(f"Failed to extract 'blobId' from Walrus response. Full response: {new_blob_info}")
                        raise HTTPException(
                            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
                            detail="Failed to store processed dataset: Invalid or unexpected response from storage service."
                        )
                    
                    # Now, public_blob_id should hold the correct value like "pFPT2GufO4yV45PJtuOYzDI0o1okc7CSrZBq-1xx3uI"
                    new_dataset_walrus_url = f"{WALRUS_PUBLISHER_BLOB_URL_PREFIX}/{public_blob_id}"
                    print(f"new_dataset_walrus_url: {new_dataset_walrus_url}")
                    logger.info(f"Processed dataset uploaded to Walrus. Constructed URL: {new_dataset_walrus_url}")

            finally:
                if temp_download_dir and Path(temp_download_dir).exists():
                    shutil.rmtree(temp_download_dir)
                    logger.info(f"Cleaned up temporary download directory: {temp_download_dir}")
                if temp_upload_file_path and temp_upload_file_path.exists():
                    os.remove(temp_upload_file_path)
                    logger.info(f"Cleaned up temporary upload file: {temp_upload_file_path}")

            # --- Step 7: Store the details in ProcessedDataset table ---
            # (Your existing code for this step, ensure metadata like 'size' uses the correct file path if needed before deletion)
            # ...
            # Make sure 'size' in metadata is calculated BEFORE temp_upload_file_path is deleted if you use os.path.getsize()
            file_size = 0
            if temp_upload_file_path and Path(temp_upload_file_path).exists(): # Check existence before getsize
                file_size = Path(temp_upload_file_path).stat().st_size # Use Pathlib for consistency

            processed_dataset_db_id = str(uuid.uuid4())
            name = f"{campaign.title}_processed_dataset"
            description = f"Aggregated dataset from campaign: {campaign.description or 'N/A'}" # Handle None description
            storage_type = StorageType.WALRUS # Make sure StorageType is defined/imported
            
            metadata = {
                "source_campaign_id": campaign.id,
                "source_campaign_onchain_id": campaign.onchain_campaign_id,
                "processed_file_type": output_dataset_file_ext,
                "num_source_contributions": len(contributions), # Total contributions for the campaign
                "num_contributions_processed_for_content": len(all_extracted_texts), # Actual number included
                "size_bytes": file_size, # Calculated size
                "original_data_requirements": campaign.data_requirements,
                "original_quality_criteria": campaign.quality_criteria,
            }
            db_processed_dataset = ProcessedDataset(
                id=processed_dataset_db_id,
                name=name,
                description=description,
                campaign_id=campaign.id,
                creator_wallet_address=campaign.creator_wallet_address,
                storage_type=storage_type,
                metadata_=metadata,
                storage_url=new_dataset_walrus_url,
                onchain_campaign_id=campaign.onchain_campaign_id,
                # processed_file_type=output_dataset_file_ext,
                # status="completed"
            )
            db.add(db_processed_dataset)
            db.commit()
            db.refresh(db_processed_dataset)
            logger.info(f"Processed dataset details saved to DB with ID: {db_processed_dataset.id}")

            # --- Step 8: Return the ProcessedDatasetResponse ---
            response_data = ProcessedDatasetResponse.from_orm(db_processed_dataset)
            
            return response_data
    except Exception as e:
        logger.error(f"Error creating processed dataset: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create processed dataset: {str(e)}")
    

@ml_ops_router.get("/datasets/{dataset_id}", response_model=ProcessedDatasetResponse)
async def get_processed_dataset(dataset_id: str, db: Session = Depends(get_session)):
    db_obj = db.query(ProcessedDataset).filter(ProcessedDataset.id == dataset_id).first()
    if not db_obj: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    resp_model = ProcessedDatasetResponse.from_orm(db_obj)
    return resp_model


@ml_ops_router.get("/datasets", response_model=List[ProcessedDatasetResponse])
async def list_processed_datasets(creator_wallet: Optional[str] = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_session)):
    q = db.query(ProcessedDataset)
    if creator_wallet: q = q.filter(ProcessedDataset.creator_wallet_address == creator_wallet)
    return [ProcessedDatasetResponse.from_orm(ds) for ds in q.order_by(ProcessedDataset.created_at.desc()).offset(skip).limit(limit).all()]


# --- User External Service Credentials Endpoints (Copied, minor adjustments) ---
@ml_ops_router.post("/user-credentials", response_model=UserExternalServiceCredentialResponse, status_code=status.HTTP_201_CREATED)
async def create_user_credential(cred_in: UserExternalServiceCredentialCreate, db: Session = Depends(get_session)):
    if db.query(UserExternalServiceCredential).filter_by(user_wallet_address=cred_in.user_wallet_address, platform=cred_in.platform, credential_name=cred_in.credential_name).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Credential name exists for user/platform.")
    db_cred = UserExternalServiceCredential(user_wallet_address=cred_in.user_wallet_address, platform=cred_in.platform, credential_name=cred_in.credential_name, additional_config=cred_in.additional_config)
    if cred_in.api_key: db_cred.set_api_key(cred_in.api_key.get_secret_value())
    if cred_in.secret_key: db_cred.set_secret_key(cred_in.secret_key.get_secret_value())
    db.add(db_cred); db.commit(); db.refresh(db_cred)
    resp_data = UserExternalServiceCredentialResponse.from_orm(db_cred).model_dump(); resp_data["has_api_key"] = bool(db_cred.encrypted_api_key); resp_data["has_secret_key"] = bool(db_cred.encrypted_secret_key)
    return UserExternalServiceCredentialResponse(**resp_data)


@ml_ops_router.get("/user-credentials/{credential_id}", response_model=UserExternalServiceCredentialResponse)
async def get_user_credential(credential_id: str, db: Session = Depends(get_session)):
    db_cred = db.query(UserExternalServiceCredential).filter(UserExternalServiceCredential.id == credential_id).first()
    if not db_cred: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credential not found")
    resp_data = UserExternalServiceCredentialResponse.from_orm(db_cred).model_dump(); resp_data["has_api_key"] = bool(db_cred.encrypted_api_key); resp_data["has_secret_key"] = bool(db_cred.encrypted_secret_key)
    return UserExternalServiceCredentialResponse(**resp_data)

@ml_ops_router.get("/user-credentials/by-user/{user_wallet}", response_model=List[UserExternalServiceCredentialResponse]) # Renamed path param
async def list_user_credentials(user_wallet: str, db: Session = Depends(get_session)): # Renamed func param
    creds = db.query(UserExternalServiceCredential).filter(UserExternalServiceCredential.user_wallet_address == user_wallet).all()
    return [UserExternalServiceCredentialResponse.from_orm(c).model_copy(update={"has_api_key": bool(c.encrypted_api_key), "has_secret_key": bool(c.encrypted_secret_key)}) for c in creds]

@ml_ops_router.delete("/user-credentials/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_credential(credential_id: str, db: Session = Depends(get_session)):
    db_cred = db.query(UserExternalServiceCredential).filter(UserExternalServiceCredential.id == credential_id).first()
    if not db_cred: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credential not found")
    if db.query(AITrainingJob).filter(AITrainingJob.user_credential_id == credential_id, AITrainingJob.status.in_([JobStatus.PENDING, JobStatus.RUNNING])).count() > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Credential in use by active job(s).")
    db.delete(db_cred); db.commit()


# --- AI Training Jobs Endpoints (Enhanced) ---
@ml_ops_router.post("/training-jobs", response_model=AITrainingJobResponse, status_code=status.HTTP_202_ACCEPTED) # 202 for background task
async def create_training_job(job_in: AITrainingJobCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_session)):
    if not db.query(ProcessedDataset).filter(ProcessedDataset.id == job_in.processed_dataset_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Dataset {job_in.processed_dataset_id} not found.")
    if job_in.user_credential_id:
        cred = db.query(UserExternalServiceCredential).filter(UserExternalServiceCredential.id == job_in.user_credential_id).first()
        if not cred: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Credential {job_in.user_credential_id} not found.")
        if cred.platform != job_in.platform: raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Credential/Job platform mismatch.")
        if cred.user_wallet_address != job_in.user_wallet_address: raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Credential does not belong to user.")
    
    db_job = AITrainingJob(**job_in.model_dump())
    db_job.status = JobStatus.PENDING
    db.add(db_job); db.commit(); db.refresh(db_job)
    
    # Use Celery here in production: send_training_job.delay(job_id=db_job.id)
    background_tasks.add_task(submit_training_job_to_platform, job_id=db_job.id, db_provider=get_session_with_ctx_manager)
    logger.info(f"AITrainingJob {db_job.id} created and submission task queued.")
    return AITrainingJobResponse.from_orm(db_job) # Return immediately with PENDING status


@ml_ops_router.get("/training-jobs/{job_id}", response_model=AITrainingJobResponse)
async def get_training_job(job_id: str, db: Session = Depends(get_session)):
    db_job = db.query(AITrainingJob).filter(AITrainingJob.id == job_id).first()
    if not db_job: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training job not found")
    
    return AITrainingJobResponse.from_orm(db_job)



@ml_ops_router.get("/training-jobs/by-user/{user_wallet}", response_model=List[AITrainingJobResponse]) # Renamed path param
async def list_training_jobs_by_user(user_wallet: str, status: Optional[JobStatus] = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_session)): # Renamed func param
    q = db.query(AITrainingJob).filter(AITrainingJob.user_wallet_address == user_wallet)
    if status: q = q.filter(AITrainingJob.status == status)
    return [AITrainingJobResponse.from_orm(job) for job in q.order_by(AITrainingJob.created_at.desc()).offset(skip).limit(limit).all()]


# --- Webhook Authentication Helper ---
def verify_webhook_signature(payload_body: bytes, received_signature: str, secret: SecretStr) -> bool:
    if not received_signature or not secret.get_secret_value():
        logger.warning("Webhook signature verification failed: No signature or secret provided/configured.")
        return False # Deny if secret isn't configured or no signature sent
    expected_signature = "sha256=" + hmac.new(secret.get_secret_value().encode(), payload_body, hashlib.sha256).hexdigest()
    is_valid = hmac.compare_digest(expected_signature, received_signature)
    if not is_valid:
        logger.warning(f"Webhook signature mismatch. Expected: '{expected_signature}', Received: '{received_signature}'")
    return is_valid

@ml_ops_router.post("/training-jobs/{job_id}/status-update-webhook", response_model=AITrainingJobResponse)
async def training_job_webhook_update(
    job_id: str,
    update_data: TrainingJobStatusUpdate,
    request_body: bytes = Body(...), # To get raw body for signature verification
    x_hub_signature_256: Optional[str] = Header(None), # Example header for signature
    db: Session = Depends(get_session)
):
    
    # Webhook Authentication
    if not verify_webhook_signature(request_body, x_hub_signature_256, WEBHOOK_SHARED_SECRET):
        logger.warning(f"Webhook for job {job_id}: Invalid signature or missing secret.")
        # raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature or authentication failed.")
        # For testing, you might bypass this, but NEVER in production without auth.
        logger.warning("Bypassing webhook signature verification for testing. THIS IS INSECURE.")


    db_job = db.query(AITrainingJob).filter(AITrainingJob.id == job_id).first()
    if not db_job: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found for webhook.")

    logger.info(f"Webhook for job {job_id}: status={update_data.status}, metrics={update_data.metrics is not None}")
    
    db_job.status = update_data.status
    if update_data.metrics: db_job.metrics = {**(db_job.metrics or {}), **update_data.metrics} # Merge
    if update_data.external_job_id: db_job.external_job_id = update_data.external_job_id
    if update_data.output_model_storage_type: db_job.output_model_storage_type = update_data.output_model_storage_type
    if update_data.output_model_url: db_job.output_model_url = update_data.output_model_url
    if update_data.logs_url: db_job.logs_url = update_data.logs_url
    if update_data.error_message: db_job.error_message = update_data.error_message
    current_time_utc = datetime.now(timezone.utc)
    if update_data.status == JobStatus.RUNNING and not db_job.started_at: db_job.started_at = datetime.now(timezone.utc)
    if db_job.status.is_terminal and not db_job.completed_at: # Using JobStatus enum property
        db_job.completed_at = current_time_utc
    if update_data.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]: db_job.completed_at = datetime.now(timezone.utc)
    db_job.updated_at = datetime.now(timezone.utc) # Force update timestamp

    if (db_job.status == JobStatus.COMPLETED and
        db_job.output_model_url and
        db_job.output_model_storage_type and
        db_job.training_script_config and # Ensure this exists
        db_job.training_script_config.get("target_hf_repo_id")):
        
        logger.info(f"Job {db_job.id} COMPLETED with artifacts at {db_job.output_model_url}. Conceptual HF upload would trigger here.")
        # In Phase 7, this block will:
        # 1. Create a temp directory.
        # 2. Call `download_and_extract_artifacts(...)`
        # 3. Call `upload_to_huggingface(...)`
        # 4. Update `db_job.huggingface_model_url`
        # 5. Handle errors and update `db_job.error_message`
        # For now, just log the intent.
        if not HUGGING_FACE_HUB_TOKEN_MLOPS:
            logger.warning(f"Job {db_job.id} would upload to HF, but MLOps HF token not set.")
            db_job.error_message = (db_job.error_message + "; " if db_job.error_message else "") + "HF upload skipped: MLOps token missing."
        else:
            # This is where the call to the uploader service/functions would go
            # For now, setting a placeholder in huggingface_model_url to show it was considered
            db_job.huggingface_model_url = f"https://huggingface.co/{db_job.training_script_config.get('target_hf_repo_id')}_mock_upload"
            logger.info(f"Mocked HF upload: URL set to {db_job.huggingface_model_url}")

    try:
        db.commit()
        db.refresh(db_job)
    except Exception as e: # Catch potential DB errors during commit
        db.rollback()
        logger.error(f"Error committing webhook updates for job {db_job.id}: {e}", exc_info=True)
        # Potentially raise HTTPException here if critical, or just log
        # If commit fails, the job state in DB won't reflect the webhook update.
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save job update from webhook.")

    return db_job


