import os
import logging
import asyncio
import aiofiles
import aios
import uuid
import tempfile
import shutil
from pathlib import Path
from datetime import datetime, timezone
from typing import Callable, Optional, Tuple, List
from sqlalchemy import select

from sqlalchemy.orm import Session, selectinload

# Assuming your models and enums are in these locations
import app.ai_training.models as ai_models # Use alias to avoid conflict if needed
from app.core.database import SessionLocal
from app.core.enums.ai_training import JobStatus, TrainingPlatform
from app.core.constants import (
    LOCAL_TRAINING_BASE_DIR,
    AWS_ACCESS_KEY_ID_MLOPS,
    AWS_SECRET_ACCESS_KEY_MLOPS,
    AWS_REGION_MLOPS,
    GCP_PROJECT_ID_MLOPS,
    GCP_SERVICE_ACCOUNT_KEY_PATH_MLOPS,
    HUGGING_FACE_HUB_TOKEN_MLOPS
)
from app.ai_training.utils.hf_uploader import download_and_extract_artifacts, upload_to_huggingface
from app.ai_training.utils.data_preparation import prepare_dataset_for_local_training
from app.ai_training.runners.local_script_runner import execute_local_training_script
from app.ai_training.runners.sagemaker_runner import submit_sagemaker_training_job
from app.ai_training.runners.vertex_ai_runner import submit_vertex_ai_training_job
from app.ai_training.runners.huggingface_runner import submit_huggingface_training_job
from app.ai_training.models import AITrainingJob, Model
from app.ai_training.schemas import ModelCreate
from app.core.exceptions import NotFoundError
from app.ai_training.utils.download import download_file
from app.core.logger import logger


logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)


def create_model(
    db: Session, data: ModelCreate, user_id: str
) -> Model:
    """
    Create a new Model record (status=training) and return it.
    """
    m = Model(
        name=data.name,
        description=data.description,
        provider=data.provider,
        base_model=data.base_model,
        dataset_used=data.dataset_id,
        training_config=data.training_config,
        tags=data.tags,
        trained_by_id=user_id,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    logger.info("model.created", model_id=m.id, by=user_id)
    return m

def get_model(db: Session, model_id: str) -> Model:
    m = db.query(Model).filter(Model.id == model_id).first()
    if not m:
        raise NotFoundError(f"Model {model_id} not found")
    return m

def list_models(
    db: Session,
    page: int = 1,
    limit: int = 20,
    search: str = None,
) -> Tuple[List[Model], int]:
    query = db.query(Model)
    if search:
        query = query.filter(Model.name.ilike(f"%{search}%"))
    total = query.count()
    items = query.offset((page - 1) * limit).limit(limit).all()
    return items, total

async def submit_training_job_to_platform(job_id: str, db_provider: Callable[[], Session]):
    """
    Background task to submit a training job to the specified platform.
    Uses real SQLAlchemy models. Platform SDK calls are still conceptual/mocked initially.
    """
    with db_provider() as db:
        try:
            job = db.query(ai_models.AITrainingJob).filter(ai_models.AITrainingJob.id == job_id).first()
            if not job:
                logger.error(f"Background task (job_id: {job_id}): Job not found. Cannot submit.")
                return

            if not job.dataset_url:
                logger.error(f"Background task (job_id: {job.id}): Dataset URL not found.")
                job.status = JobStatus.FAILED
                job.error_message = "Dataset URL not found for the job."
                job.completed_at = datetime.now(timezone.utc)
                db.commit()
                return
            
            if job.platform != TrainingPlatform.LOCAL_SERVER and not job.user_credential_id:
                logger.error(f"Background task (job_id: {job.id}): UserCredential specified but not found (ID: {job.user_credential_id}).")
                job.status = JobStatus.FAILED
                job.error_message = f"UserCredential ID {job.user_credential_id} not found."
                job.completed_at = datetime.now(timezone.utc)
                db.commit()
                return

            logger.info(f"Background task (job_id: {job.id}): Submitting job '{job.job_name}' for model_type '{job.model_type}' on platform '{job.platform.value}'")
            job.status = JobStatus.SUBMITTED
            job.started_at = datetime.now(timezone.utc)
            db.commit()

            script_config = job.training_script_config or {}
            external_job_id_from_platform: Optional[str] = None
            error_message_from_platform: Optional[str] = None
            # platform_output_uri = script_config.get("platform_output_uri") # Not used in mocks yet
            # base_model_id_for_finetuning = script_config.get("base_model_id") # Not used in mocks yet
            
            # external_job_id = None

            if job.platform == TrainingPlatform.LOCAL_SERVER:
                logger.info(f"[Service job_id={job.id}]: Starting LOCAL_SERVER training job setup.")
                job.status = JobStatus.PREPARING_DATA # New status
                await db.commit()

                # --- Setup Local Directories ---
                job_run_dir = LOCAL_TRAINING_BASE_DIR / job.id
                input_data_dir = job_run_dir / "input_data"
                model_output_dir = job_run_dir / "output_model"
                logs_dir = job_run_dir / "logs" # Central logs dir for the job

                try:
                    await aios.makedirs(input_data_dir, exist_ok=True)
                    await aios.makedirs(model_output_dir, exist_ok=True)
                    await aios.makedirs(logs_dir, exist_ok=True)
                    logger.info(f"[Service job_id={job.id}]: Local directories created: {job_run_dir}")
                except Exception as e_dir:
                    logger.error(f"[Service job_id={job.id}]: Failed to create local directories: {e_dir}", exc_info=True)
                    job.status = JobStatus.FAILED
                    job.error_message = f"Failed to create local directories: {e_dir}"
                    job.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                    return # Exit if directories can't be made
                
                # --- Prepare Dataset ---
                logger.info(f"[Service job_id={job.id}]: Preparing dataset for local training.")
                # job.processed_dataset should be loaded if needed, or ensure it's loaded before this call
                # The initial query for job in this service should ideally eager load job.processed_dataset
                # For example, using: options(selectinload(ai_models.AITrainingJob.processed_dataset))
                if not job.dataset_url: # Defensive check
                    # This should have been caught earlier in the service function
                    logger.error(f"[Service job_id={job.id}]: Dataset URL not loaded on job object.")
                    job.status = JobStatus.FAILED
                    job.error_message = "Internal Error: Dataset URL not loaded for local training prep."
                    job.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                    return

                dataset_prepared = await prepare_dataset_for_local_training(
                    dataset_url=job.dataset_url,
                    target_input_data_dir=str(input_data_dir.resolve()),
                    job_id=job.id
                )

                if not dataset_prepared:
                    logger.error(f"[Service job_id={job.id}]: Dataset preparation failed.")
                    job.status = JobStatus.FAILED
                    job.error_message = (job.error_message or "") + "; Dataset preparation failed for local training."
                    job.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                    return # Exit if dataset prep fails

                logger.info(f"[Service job_id={job.id}]: Dataset prepared. Submitting to local script runner.")
                
                # Define log file paths
                stdout_log_path = logs_dir / "training_stdout.log"
                stderr_log_path = logs_dir / "training_stderr.log"

                # The actual execution and monitoring will happen in the background via execute_local_training_script
                # which itself schedules a monitor. So, this function will return quickly after this call.
                # `execute_local_training_script` updates the job status to RUNNING.
                await execute_local_training_script(
                    job=job, # Pass the ORM object
                    job_run_dir=job_run_dir,
                    input_data_dir=input_data_dir,
                    model_output_dir=model_output_dir,
                    stdout_log_path=stdout_log_path,
                    stderr_log_path=stderr_log_path,
                    db_session_factory=db
                )
                # No explicit commit here for job status, as execute_local_training_script handles it.
                # The job status will be PENDING -> PREPARING_DATA -> (by execute_local_script) RUNNING -> (by monitor) COMPLETED/FAILED
                logger.info(f"[Service job_id={job.id}]: Local training script execution process initiated.")
                # No need to update external_job_id or status here; execute_local_training_script does that.
                # The service's responsibility for LOCAL_SERVER is to set up and kick off the runner.
                # The function returns, and the subprocess runs independently, monitored by `monitor_local_job_completion`.

            elif job.platform == TrainingPlatform.AWS_SAGEMAKER:
                logger.info(f"[Service job_id={job.id}]: Starting AWS_SAGEMAKER training job submission process.")
                
                # submit_sagemaker_training_job is async
                sm_job_name, error_message = await submit_sagemaker_training_job(job=job)

                if error_message:
                    logger.error(f"[Service job_id={job.id}]: SageMaker submission failed: {error_message}")
                    job.status = JobStatus.FAILED
                    job.error_message = error_message
                    job.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                    return # Exit processing for this job

                # If submission was successful (sm_job_name is not None)
                job.external_job_id = sm_job_name # This is the SageMaker Training Job Name
                job.status = JobStatus.QUEUED # SageMaker jobs go into a preparing/queued state first
                
                # Construct a basic logs URL. A more precise one can be formed after DescribeTrainingJob.
                aws_region_for_logs = (job.user_credential.additional_config.get("region")
                                       if job.user_credential and job.user_credential.additional_config
                                       else AWS_REGION_MLOPS)
                job.logs_url = f"https://{aws_region_for_logs}.console.aws.amazon.com/sagemaker/home?region={aws_region_for_logs}#/jobs/{sm_job_name}"
                
                await db.commit()
                logger.info(f"[Service job_id={job.id}]: Successfully submitted to SageMaker. External Job Name: {job.external_job_id}, Status: {job.status.value}")

            elif job.platform == TrainingPlatform.GOOGLE_VERTEX_AI:
                logger.info(f"[Service job_id={job.id}]: Starting GOOGLE_VERTEX_AI training job submission process.")
                
                vertex_job_resource_name, error_message = await submit_vertex_ai_training_job(job=job)

                if error_message:
                    logger.error(f"[Service job_id={job.id}]: Vertex AI submission failed: {error_message}")
                    job.status = JobStatus.FAILED
                    job.error_message = error_message
                    job.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                    return

                job.external_job_id = vertex_job_resource_name # Full resource name
                job.status = JobStatus.QUEUED # Vertex AI jobs also go into a preparing/queued state

                gcp_project_id_for_logs = (job.user_credential.additional_config.get("project_id")
                                          if job.user_credential and job.user_credential.additional_config
                                          else script_config.get("gcp_project_id") or GCP_PROJECT_ID_MLOPS)
                # Vertex AI job ID is the last part of the resource name
                vertex_job_id_short = vertex_job_resource_name.split('/')[-1]
                # Link to the Vertex AI UI -> Custom Jobs list, filtered by job ID
                job.logs_url = f"https://console.cloud.google.com/vertex-ai/training/custom-jobs/locations/{gcp_region_from_job_or_settings}/jobs/{vertex_job_id_short}?project={gcp_project_id_for_logs}"
                # (Need to get gcp_region_from_job_or_settings from where it was determined in the runner)
                # For simplicity, use the one from job config or settings:
                gcp_region_for_logs = (job.user_credential.additional_config.get("region")
                                     if job.user_credential and job.user_credential.additional_config
                                     else (job.training_script_config or {}).get("gcp_region") or "us-central1")
                job.logs_url = f"https://console.cloud.google.com/vertex-ai/training/custom-jobs/locations/{gcp_region_for_logs}/jobs/{vertex_job_id_short}?project={gcp_project_id_for_logs}"


                await db.commit()
                logger.info(f"[Service job_id={job.id}]: Successfully submitted to Vertex AI. External Job ID (Resource Name): {job.external_job_id}, Status: {job.status.value}")
            
            elif job.platform == TrainingPlatform.HUGGING_FACE:
                logger.info(f"[Service job_id={job.id}]: Submitting to Hugging Face (via Space creation).")
                
                if not job.dataset_url:
                    error_message_from_platform = "Processed dataset's Akave storage URL is missing."
                    logger.error(f"[Service job_id={job.id}]: {error_message_from_platform}")
                    # The error handling logic at the end of the function will catch this.
                else:
                    
                    if job.dataset_url:
                        print(f"[Service job_id={job.id}]: Proceeding with dataset blob_id: {job.dataset_url}")
                        temp_dataset_download_dir: Optional[str] = None
                        local_dataset_path_for_hf: Optional[Path] = None
                        try:
                            print(f"[Service job_id={job.id}]: Creating temporary download directory for dataset...")
                            temp_dataset_download_dir = tempfile.mkdtemp(prefix=f"hf_dataset_job_{job.id}_")
                            print(f"[Service job_id={job.id}]: Temporary download directory created: {temp_dataset_download_dir}")

                            # Ensure file_ext starts with a dot if it's a simple extension name and not empty
                            if job.file_type and not job.file_type.startswith("."):
                                job.file_type = "." + job.file_type
                            safe_blob_filename_part = Path(job.dataset_url.split("/")[-1]).name # Basic sanitization
                            print(f"[Service job_id={job.id}]: Safe blob filename part: '{safe_blob_filename_part}'")
                            temp_filename = f"{safe_blob_filename_part}{job.file_type}"
                            print(f"[Service job_id={job.id}]: Temporary filename: '{temp_filename}'")
                            
                            local_dataset_path_for_hf = Path(temp_dataset_download_dir) / temp_filename
                            print(f"[Service job_id={job.id}]: Local dataset path for Hugging Face: '{local_dataset_path_for_hf}'")
                            
                            print(f"[Service job_id={job.id}]: Downloading dataset blob '{dataset_blob_id}' from Akave to '{local_dataset_path_for_hf}'")
                            
                            # async with AkaveLinkAPI() as akave_client: # Ensure AkaveLinkAPI is correctly initialized
                            #     await akave_client.download_file(blob_id=dataset_blob_id, output_path=local_dataset_path_for_hf)
                            await download_file(job.dataset_url, job.file_type, local_dataset_path_for_hf)

                            if not local_dataset_path_for_hf.exists() or local_dataset_path_for_hf.stat().st_size == 0:
                                raise FileNotFoundError(f"Downloaded dataset file '{local_dataset_path_for_hf}' is missing or empty.")
                            
                            logger.info(f"[Service job_id={job.id}]: Dataset downloaded successfully to '{local_dataset_path_for_hf}'.")
                
                            # The submit_huggingface_training_job function handles creation of Space and initial setup.
                            # It returns the Space repo ID as the external_job_id.
                            external_job_id_from_platform, error_message_from_platform = await submit_huggingface_training_job(
                                job=job, # Pass the full job ORM object
                                local_dataset_path=str(local_dataset_path_for_hf.resolve()) # Pass absolute path as string
                            )

                            if not error_message_from_platform and external_job_id_from_platform:
                                job.external_job_id = external_job_id_from_platform # This is the Space repo ID
                                job.status = JobStatus.SUBMITTED
                                job.logs_url = f"https://huggingface.co/spaces/{external_job_id_from_platform}"
                                # The actual model output URL (target_model_repo_id) is set by submit_huggingface_training_job
                                # on the job object if it modifies it directly, or the monitoring task for HF space would set it.
                                # submit_huggingface_training_job already sets job.output_model_url and storage_type.
                                logger.info(f"[Service job_id={job.id}]: Hugging Face Space creation initiated. Space Repo ID: {job.external_job_id}, Status: {job.status.value}")

                        except Exception as e_hf_prep:
                            error_message_from_platform = f"Error during dataset download or Hugging Face job preparation: {e_hf_prep}"
                            logger.error(f"[Service job_id={job.id}]: {error_message_from_platform}", exc_info=True)
                            # external_job_id_from_platform remains None or its last value
                        finally:
                            if temp_dataset_download_dir and Path(temp_dataset_download_dir).exists():
                                logger.info(f"[Service job_id={job.id}]: Cleaning up temporary dataset download directory: {temp_dataset_download_dir}")
                                # shutil.rmtree is blocking; run in thread pool executor for async
                                await asyncio.to_thread(shutil.rmtree, temp_dataset_download_dir)

            else:
                error_message_from_platform = f"Training platform '{job.platform.value}' submission not implemented."
                logger.error(f"Job {job.id}: {error_message_from_platform}")
                # Status updated below

            # --- Post-submission status update for cloud platforms ---
            if job.platform != TrainingPlatform.LOCAL_SERVER:
                if error_message_from_platform:
                    logger.error(f"[Service job_id={job.id}]: Platform submission failed: {error_message_from_platform}")
                    job.status = JobStatus.FAILED
                    job.error_message = (job.error_message or "") + "; " + error_message_from_platform
                    job.completed_at = datetime.now(timezone.utc)
                elif external_job_id_from_platform:
                    # Status and logs_url should have been set in the specific platform block
                    logger.info(f"Background task (job_id: {job.id}): Job successfully handed off to {job.platform.value}. External ID: {job.external_job_id}, Status: {job.status.value}")
                else: # Should not happen if error_message_from_platform is None
                    logger.error(f"[Service job_id={job.id}]: Platform submission attempt for {job.platform.value} resulted in no error but no external ID.")
                    job.status = JobStatus.FAILED
                    job.error_message = (job.error_message or "") + f"; Platform {job.platform.value} submission silent failure."
                    job.completed_at = datetime.now(timezone.utc)
                
                db.commit()
                logger.info(f"Background task (job_id: {job.id}): Successfully submitted job to {job.platform.value}. External ID: {job.external_job_id}, Status: {job.status.value}")

        except ValueError as ve: # Catch specific configuration errors
            logger.error(f"Background task (job_id: {job_id if 'job' in locals() and job else 'unknown'}): Configuration error - {ve}", exc_info=True)
            if 'job' in locals() and job:
                job.status = JobStatus.FAILED
                job.error_message = str(ve)[:1024]
                job.completed_at = datetime.now(timezone.utc)
                db.commit()
        except Exception as e:
            logger.error(f"Background task (job_id: {job_id if 'job' in locals() and job else 'unknown'}): Failed to submit - {e}", exc_info=True)
            if 'job' in locals() and job:
                job.status = JobStatus.FAILED
                job.error_message = str(e)[:1024]
                job.completed_at = datetime.now(timezone.utc)
                db.commit()


async def process_and_upload_to_hf_background(
    job_id: str,
    db_session_factory: Callable[[], Session] = SessionLocal
):
    """
    Background task to download model artifacts, (optionally) generate a model card,
    and upload them to Hugging Face Hub. Updates the AITrainingJob record with
    the Hugging Face model URL or an error message.
    """
    async with db_session_factory() as db:
        job: Optional[ai_models.AITrainingJob] = None
        temp_model_artifacts_dir: Optional[str] = None # Path to the dir where artifacts are extracted

        try:
            logger.info(f"[HF Upload Task job_id={job_id}]: Starting Hugging Face upload process.")
            
            # Fetch the job with necessary related data
            stmt = select(ai_models.AITrainingJob).where(ai_models.AITrainingJob.id == job_id).options(
                selectinload(ai_models.AITrainingJob.processed_dataset), # For model card
                selectinload(ai_models.AITrainingJob.user_credential)   # For potential cloud creds if needed
            )
            result = await db.execute(stmt)
            job = result.scalars().first()

            if not job:
                logger.error(f"[HF Upload Task job_id={job_id}]: Job not found. Aborting upload.")
                return

            # --- Pre-checks ---
            if job.status != JobStatus.COMPLETED:
                logger.warning(f"[HF Upload Task job_id={job_id}]: Job status is '{job.status.value}', not COMPLETED. Skipping HF upload.")
                return
            if not job.output_model_url or not job.output_model_storage_type:
                logger.error(f"[HF Upload Task job_id={job_id}]: Job is missing output_model_url or output_model_storage_type. Aborting.")
                job.error_message = (job.error_message or "") + "; HF Upload Failed: Missing model output URL/type."
                await db.commit()
                return
            if not job.training_script_config or not job.training_script_config.get("target_hf_repo_id"):
                logger.error(f"[HF Upload Task job_id={job_id}]: Job is missing target_hf_repo_id in training_script_config. Aborting.")
                job.error_message = (job.error_message or "") + "; HF Upload Failed: Missing target_hf_repo_id."
                await db.commit()
                return

            mlops_hf_token = HUGGING_FACE_HUB_TOKEN_MLOPS
            if not mlops_hf_token:
                logger.error(f"[HF Upload Task job_id={job_id}]: MLOps Hugging Face token (HUGGING_FACE_HUB_TOKEN_MLOPS) is not configured. Aborting.")
                job.error_message = (job.error_message or "") + "; HF Upload Failed: MLOps HF token not configured."
                await db.commit()
                return

            # --- Download and Extract Artifacts ---
            logger.info(f"[HF Upload Task job_id={job_id}]: Creating temporary directory for model artifacts.")
            # Create a unique temporary directory for this job's artifacts
            temp_model_artifacts_dir = tempfile.mkdtemp(prefix=f"hf_upload_job_{job.id}_")
            logger.info(f"[HF Upload Task job_id={job_id}]: Temporary directory created: {temp_model_artifacts_dir}")


            # Prepare credentials for download if necessary
            # User-specific credentials take precedence if platform is not LOCAL_SERVER
            # and the output storage is on a user's cloud account.
            # For simplicity, this example assumes MLOps credentials are used for S3/GCS.
            # A more complex setup might involve checking job.user_credential for relevant keys.
            aws_access_key = AWS_ACCESS_KEY_ID_MLOPS
            aws_secret_key = AWS_SECRET_ACCESS_KEY_MLOPS
            aws_region = AWS_REGION_MLOPS
            gcp_project = GCP_PROJECT_ID_MLOPS
            gcp_creds_path = GCP_SERVICE_ACCOUNT_KEY_PATH_MLOPS

            logger.info(f"[HF Upload Task job_id={job_id}]: Downloading artifacts from {job.output_model_url} (Type: {job.output_model_storage_type.value}).")
            download_success = await download_and_extract_artifacts(
                job_id=job.id,
                artifact_url=job.output_model_url,
                artifact_storage_type=job.output_model_storage_type,
                target_local_dir=temp_model_artifacts_dir,
                aws_access_key_id=aws_access_key,
                aws_secret_access_key=aws_secret_key,
                aws_region=aws_region,
                gcp_project_id=gcp_project,
                gcp_credentials_path=gcp_creds_path
            )

            if not download_success:
                logger.error(f"[HF Upload Task job_id={job_id}]: Failed to download or extract artifacts from {job.output_model_url}.")
                job.error_message = (job.error_message or "") + f"; HF Upload Failed: Artifact download/extraction from {job.output_model_url} failed."
                await db.commit()
                return
            
            logger.info(f"[HF Upload Task job_id={job_id}]: Artifacts successfully downloaded and extracted to {temp_model_artifacts_dir}.")

            # --- Upload to Hugging Face Hub ---
            target_hf_repo_id = job.training_script_config.get("target_hf_repo_id")
            hf_repo_private = job.training_script_config.get("hf_repo_private", False) # Default to public
            hf_commit_message = f"Upload model from AI Training Platform Job ID: {job.id} - {job.job_name}"
            
            logger.info(f"[HF Upload Task job_id={job_id}]: Starting upload to Hugging Face Hub repository: {target_hf_repo_id}.")
            
            # huggingface_repo_url = await upload_to_huggingface(
            #     local_model_dir=temp_model_artifacts_dir,
            #     hf_repo_id=target_hf_repo_id,
            #     hf_token=mlops_hf_token,
            #     job_details=job, # Pass the ORM model instance
            #     commit_message=hf_commit_message,
            #     private_repo=hf_repo_private,
            #     generate_readme_if_missing=True # Assuming default True
            # )
            huggingface_repo_url = await asyncio.to_thread(upload_to_huggingface,
                local_model_dir=temp_model_artifacts_dir,
                hf_repo_id=target_hf_repo_id,
                hf_token=mlops_hf_token,
                job_details=job, # Pass the ORM model instance
                commit_message=hf_commit_message,
                private_repo=hf_repo_private,
                generate_readme_if_missing=True # Assuming default True
            )

            if huggingface_repo_url:
                job.huggingface_model_url = huggingface_repo_url
                logger.info(f"[HF Upload Task job_id={job_id}]: Successfully uploaded to Hugging Face: {huggingface_repo_url}")
                # Clear any previous HF-related error messages if successful now
                if job.error_message and "HF Upload Failed" in job.error_message:
                    # This is a simplistic way to clear; might need refinement
                    job.error_message = job.error_message.replace(
                        job.error_message.split("HF Upload Failed")[0] + "HF Upload Failed", ""
                    ).strip("; ")

            else:
                logger.error(f"[HF Upload Task job_id={job_id}]: Failed to upload model to Hugging Face Hub repository {target_hf_repo_id}.")
                job.error_message = (job.error_message or "") + f"; HF Upload Failed: Upload to repo {target_hf_repo_id} failed."
            
            await db.commit()

        except Exception as e:
            logger.error(f"[HF Upload Task job_id={job_id}]: An unexpected error occurred during HF upload process: {e}", exc_info=True)
            if job: # If job was fetched
                job.error_message = (job.error_message or "") + f"; HF Upload Failed: Unexpected error - {str(e)[:200]}"
                try:
                    await db.commit()
                except Exception as db_exc:
                    logger.error(f"[HF Upload Task job_id={job_id}]: Failed to commit error state to DB: {db_exc}", exc_info=True)
        finally:
            if temp_model_artifacts_dir and os.path.exists(temp_model_artifacts_dir):
                logger.info(f"[HF Upload Task job_id={job_id}]: Cleaning up temporary directory: {temp_model_artifacts_dir}")
                try:
                    # shutil.rmtree is synchronous, run in a thread for async
                    await asyncio.to_thread(shutil.rmtree, temp_model_artifacts_dir)
                    logger.info(f"[HF Upload Task job_id={job_id}]: Temporary directory {temp_model_artifacts_dir} cleaned up.")
                except Exception as e_clean:
                    logger.warning(f"[HF Upload Task job_id={job_id}]: Could not clean up temporary directory {temp_model_artifacts_dir}: {e_clean}")
            logger.info(f"[HF Upload Task job_id={job_id}]: Hugging Face upload process finished.")