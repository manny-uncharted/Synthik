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


from app.core.enums.ai_training import StorageType
from app.ai_training.utils.download import (
    download_file,
)
from app.dataset.models import Dataset
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
    dataset_url: str,
    target_input_data_dir: str,
    job_id: str
) -> bool:
    """
    Prepares the dataset specified in `dataset_url` by downloading and extracting it
    into the `target_input_data_dir`. Supports local dirs, archives, and remote files.
    Returns True on success, False on failure.
    """
    await aios.makedirs(target_input_data_dir, exist_ok=True)

    # Create a temporary file path for downloading
    tmp_fd, tmp_path = tempfile.mkstemp(prefix=f"dataset_dl_{job_id}_")
    os.close(tmp_fd)

    try:
        logger.info(f"[DataPrep job_id={job_id}]: Preparing dataset {dataset_url}")
        parsed = urlparse(dataset_url)
        filename = os.path.basename(parsed.path) or f"dataset_{job_id}"
        is_archive = filename.endswith((".tar.gz", ".tgz", ".zip"))

        # Download or copy source into tmp_path
        if parsed.scheme in ("http", "https"):
            # Remote: download to tmp
            file_type = filename.split('.')[-1]
            await asyncio.to_thread(download_file, dataset_url, file_type, tmp_path)
        else:
            # Local path: copy file or directory
            src = Path(parsed.path)
            if src.is_dir():
                await asyncio.to_thread(shutil.copytree, str(src), target_input_data_dir, dirs_exist_ok=True)
                return True
            elif src.is_file():
                await asyncio.to_thread(shutil.copy2, str(src), tmp_path)
            else:
                logger.error(f"[DataPrep job_id={job_id}]: Invalid local path {src}")
                return False

        # Extraction if archive
        if is_archive and Path(tmp_path).exists():
            logger.info(f"[DataPrep job_id={job_id}]: Extracting {tmp_path}")

            def extract():
                if tarfile.is_tarfile(tmp_path):
                    with tarfile.open(tmp_path, 'r:*') as tar:
                        tar.extractall(path=target_input_data_dir)
                elif zipfile.is_zipfile(tmp_path):
                    with zipfile.ZipFile(tmp_path, 'r') as zf:
                        zf.extractall(path=target_input_data_dir)
                else:
                    shutil.copy2(tmp_path, os.path.join(target_input_data_dir, filename))

            await asyncio.to_thread(extract)
            logger.info(f"[DataPrep job_id={job_id}]: Extraction completed")
        else:
            # Not an archive: move into target dir
            dest = Path(target_input_data_dir) / filename
            await aios.makedirs(str(dest.parent), exist_ok=True)
            await asyncio.to_thread(shutil.move, tmp_path, str(dest))
            logger.info(f"[DataPrep job_id={job_id}]: File placed at {dest}")

        return True

    except Exception as e:
        logger.error(f"[DataPrep job_id={job_id}]: Error preparing dataset: {e}", exc_info=True)
        return False

    finally:
        # Cleanup temp file if still exists
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
                logger.info(f"[DataPrep job_id={job_id}]: Cleaned up temp file {tmp_path}")
            except Exception:
                pass