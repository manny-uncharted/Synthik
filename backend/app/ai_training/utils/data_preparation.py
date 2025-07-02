import logging
import os
import tempfile
import shutil
import tarfile
import aios
import zipfile
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse
import aiofiles
import aiofiles.os as aios
import asyncio # For asyncio.to_thread

# --- Cloud SDKs (similar to hf_uploader) ---
import aiobotocore.session
from google.cloud import storage
from google.oauth2 import service_account

# --- Application Specific Imports ---
from app.ai_training.models import ProcessedDataset # SQLAlchemy model
from app.core.enums.ai_training import StorageType
# from app.core.config import settings



logger = logging.getLogger(__name__)

# --- Helper download functions (can be refactored from hf_uploader or kept separate) ---
# For brevity, let's assume similar _download_s3_artifact and _download_gcs_artifact exist here
# or are imported. We'll write simplified stubs for now focusing on the main logic.

async def _download_s3_dataset_content(
    artifact_url: str,
    local_target_path: str, # This will be a file path for the downloaded archive/file
    aws_access_key_id: Optional[str],
    aws_secret_access_key: Optional[str],
    aws_region: str
):
    logger.info(f"Downloading dataset content from S3: {artifact_url} to {local_target_path}")
    parsed_url = urlparse(artifact_url)
    bucket_name = parsed_url.netloc
    key = parsed_url.path.lstrip('/')

    session = aiobotocore.session.get_session()
    async with session.create_client(
        's3', region_name=aws_region,
        aws_access_key_id=aws_access_key_id,
        aws_secret_access_key=aws_secret_access_key
    ) as s3_client:
        try:
            response = await s3_client.get_object(Bucket=bucket_name, Key=key)
            # Ensure directory for local_target_path exists
            await aios.makedirs(os.path.dirname(local_target_path), exist_ok=True)
            async with aiofiles.open(local_target_path, "wb") as f:
                async for chunk in response['Body']:
                    await f.write(chunk)
            logger.info(f"S3 dataset content downloaded to {local_target_path}")
        except Exception as e:
            logger.error(f"Failed to download dataset content from S3 {artifact_url}: {e}", exc_info=True)
            raise

async def _download_gcs_dataset_content(
    artifact_url: str,
    local_target_path: str, # File path for downloaded archive/file
    gcp_project_id: Optional[str],
    gcp_credentials_path: Optional[str]
):
    logger.info(f"Downloading dataset content from GCS: {artifact_url} to {local_target_path}")
    parsed_url = urlparse(artifact_url)
    bucket_name = parsed_url.netloc
    blob_name = parsed_url.path.lstrip('/')

    try:
        if gcp_credentials_path:
            credentials = service_account.Credentials.from_service_account_file(gcp_credentials_path)
            storage_client = storage.Client(project=gcp_project_id or credentials.project_id, credentials=credentials)
        else:
            storage_client = storage.Client(project=gcp_project_id)
        
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        await aios.makedirs(os.path.dirname(local_target_path), exist_ok=True)
        await asyncio.to_thread(blob.download_to_filename, local_target_path)
        logger.info(f"GCS dataset content downloaded to {local_target_path}")
    except Exception as e:
        logger.error(f"Failed to download dataset content from GCS {artifact_url}: {e}", exc_info=True)
        raise


async def prepare_dataset_for_local_training(
    dataset: ProcessedDataset, # The SQLAlchemy ORM model instance
    target_input_data_dir: str, # The job's specific input_data/ directory
    job_id: str # For logging and unique temp file naming
) -> bool:
    """
    Prepares the dataset specified in `dataset` by downloading and extracting it
    into the `target_input_data_dir`.
    Returns True on success, False on failure.
    """
    await aios.makedirs(target_input_data_dir, exist_ok=True)
    
    # Temporary location to download archives before extraction
    temp_download_holder = tempfile.mkdtemp(prefix=f"dataset_dl_{job_id}_")
    downloaded_archive_path: Optional[str] = None

    try:
        logger.info(f"[DataPrep job_id={job_id}]: Preparing dataset '{dataset.name}' (ID: {dataset.id}) from {dataset.storage_url}")
        
        is_archive = dataset.storage_url.endswith((".tar.gz", ".tgz", ".zip"))
        file_name = os.path.basename(urlparse(dataset.storage_url).path) or f"dataset_content_{job_id}"
        
        if is_archive:
            downloaded_archive_path = os.path.join(temp_download_holder, file_name)
        else:
            # If not an archive, it's a single file; download directly into target_input_data_dir
            downloaded_archive_path = os.path.join(target_input_data_dir, file_name)


        if dataset.storage_type == StorageType.LOCAL_FS:
            source_path = Path(dataset.storage_url)
            if not await aios.path.exists(source_path):
                logger.error(f"[DataPrep job_id={job_id}]: Local dataset path {source_path} does not exist.")
                return False

            if await aios.path.isdir(source_path):
                logger.info(f"[DataPrep job_id={job_id}]: Dataset is a local directory. Copying contents from {source_path} to {target_input_data_dir}.")
                await asyncio.to_thread(shutil.copytree, str(source_path), str(target_input_data_dir), dirs_exist_ok=True)
                # No archive to extract, data is directly in target_input_data_dir
                return True 
            elif await aios.path.isfile(source_path):
                # It's a single file (archive or raw data file)
                dest_path_for_copy = downloaded_archive_path # This will be extracted if archive
                await aios.makedirs(os.path.dirname(dest_path_for_copy), exist_ok=True)
                logger.info(f"[DataPrep job_id={job_id}]: Dataset is a single local file. Copying from {source_path} to {dest_path_for_copy}.")
                await asyncio.to_thread(shutil.copy2, str(source_path), dest_path_for_copy)
            else: # Should not happen if exists check passed
                logger.error(f"[DataPrep job_id={job_id}]: Local dataset path {source_path} is not a file or directory.")
                return False

        elif dataset.storage_type == StorageType.S3:
            await _download_s3_dataset_content(
                dataset.storage_url, downloaded_archive_path,
                settings.AWS_ACCESS_KEY_ID_MLOPS.get_secret_value() if settings.AWS_ACCESS_KEY_ID_MLOPS else None,
                settings.AWS_SECRET_ACCESS_KEY_MLOPS.get_secret_value() if settings.AWS_SECRET_ACCESS_KEY_MLOPS else None,
                settings.AWS_REGION_MLOPS
            )
        elif dataset.storage_type == StorageType.GCS:
            await _download_gcs_dataset_content(
                dataset.storage_url, downloaded_archive_path,
                settings.GCP_PROJECT_ID_MLOPS,
                settings.GCP_SERVICE_ACCOUNT_KEY_PATH_MLOPS
            )
        elif dataset.storage_type == StorageType.WALRUS:
            # Placeholder for Walrus download logic
            # You would use your WalrusClient here.
            # walrus_client = WalrusClient(...)
            # blob_content = await walrus_client.read_blob(blob_id=dataset.storage_url) # Assuming URL is blob_id
            # async with aiofiles.open(downloaded_archive_path, "wb") as f:
            #    await f.write(blob_content)
            logger.warning(f"[DataPrep job_id={job_id}]: Walrus storage type download not fully implemented yet.")
            # For now, let's simulate failure or make it pass if testing without Walrus
            return False # Or True if you mock success
        else:
            logger.error(f"[DataPrep job_id={job_id}]: Unsupported dataset storage type: {dataset.storage_type}")
            return False

        # --- Extraction (if an archive was downloaded/copied to downloaded_archive_path and it IS an archive) ---
        if await aios.path.exists(downloaded_archive_path) and is_archive:
            logger.info(f"[DataPrep job_id={job_id}]: Extracting archive {downloaded_archive_path} to {target_input_data_dir}")
            
            def _extract_sync():
                if tarfile.is_tarfile(downloaded_archive_path):
                    with tarfile.open(downloaded_archive_path, "r:*") as tar:
                        tar.extractall(path=target_input_data_dir)
                elif zipfile.is_zipfile(downloaded_archive_path):
                    with zipfile.ZipFile(downloaded_archive_path, "r") as zip_ref:
                        zip_ref.extractall(path=target_input_data_dir)
                else:
                    # This case should ideally not be hit if is_archive was true.
                    # If it's a single file that's not an archive, it might have already been
                    # placed directly in target_input_data_dir or needs to be copied there.
                    # The logic above for non-archives already places it in target_input_data_dir.
                    logger.warning(f"[DataPrep job_id={job_id}]: File {downloaded_archive_path} was marked as archive but not recognized by tarfile/zipfile.")
                    # As a fallback, copy it if it's not already in the target dir.
                    if Path(downloaded_archive_path).parent.resolve() != Path(target_input_data_dir).resolve():
                         shutil.copy2(downloaded_archive_path, Path(target_input_data_dir) / Path(downloaded_archive_path).name)


            await asyncio.to_thread(_extract_sync)
            logger.info(f"[DataPrep job_id={job_id}]: Archive extracted successfully into {target_input_data_dir}.")
        elif not is_archive and await aios.path.exists(downloaded_archive_path):
            logger.info(f"[DataPrep job_id={job_id}]: Dataset was a single file, already placed at {downloaded_archive_path} within target input directory structure.")
        elif not await aios.path.exists(downloaded_archive_path):
            logger.error(f"[DataPrep job_id={job_id}]: Downloaded archive/file path not found: {downloaded_archive_path}")
            return False
            
        return True

    except Exception as e:
        logger.error(f"[DataPrep job_id={job_id}]: Failed to prepare dataset: {e}", exc_info=True)
        return False
    finally:
        if await aios.path.exists(temp_download_holder):
            await asyncio.to_thread(shutil.rmtree, temp_download_holder)
            logger.info(f"[DataPrep job_id={job_id}]: Cleaned up temporary download holder: {temp_download_holder}")