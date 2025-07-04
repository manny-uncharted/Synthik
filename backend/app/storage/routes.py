from fastapi import APIRouter, UploadFile, File, HTTPException, Query, BackgroundTasks, Depends
from typing import Optional, Union
import tempfile
import mimetypes
import logging
import os # For path manipulation
import shutil # For removing directory tree
from pathlib import Path
from fastapi.responses import FileResponse
import httpx
from sqlalchemy.orm import Session


from app.storage.akave import AkaveLinkAPI
from app.core.database import get_session
from app.dataset.models import Dataset

router = APIRouter(
    prefix="/storage",
    tags=["Storage"],
)

logger = logging.getLogger(__name__)

CAMPAIGN_TYPE_TO_EXTENSION = {
    
}
DEFAULT_FILE_EXTENSION = ".dat"

def _remove_temp_directory(temp_dir_path: str):
    """Safely removes a directory tree."""
    try:
        shutil.rmtree(temp_dir_path)
        # print(f"DEBUG: Successfully removed temporary directory: {temp_dir_path}") # Optional: for debugging
    except OSError as e: # More specific exception for file system errors
        # print(f"DEBUG: Error removing temporary directory {temp_dir_path}: {e}") # Optional: for debugging
        # Consider logging this error if it occurs
        pass

@router.post("/upload")
async def upload_file_to_akave(
    file: UploadFile = File(...),
    dataset_id: Optional[str] = Query(None, description="Name of the bucket"),
):
    """
    Uploads a file to storage via AkaveLinkAPI.
    """
    if not dataset_id:
        raise HTTPException(status_code=400, detail="onchain_campaign_id query parameter is required.")

    try:
        akave = AkaveLinkAPI()
        contents = await file.read()
        # write to temp
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(contents)
            tmp_path = tmp.name

        # synchronous upload
        response = akave.upload_file(
            bucket_name=dataset_id,
            file_path=tmp_path,
        )

        # cleanup temp file
        os.remove(tmp_path)
        return response

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {e}")


@router.get("/download")
async def download_file_from_akave(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_session),
    dataset_id: Optional[str] = None,
    blob_id: Optional[str] = None,
) -> FileResponse:
    """
    Downloads a file via AkaveLinkAPI and streams it to the client.
    """
    if not dataset_id or not blob_id:
        raise HTTPException(status_code=400, detail="Missing required query parameters.")

    # fetch campaign and contribution metadata
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found.")

    # derive blob_id and filename
    blob_id = Path(dataset.data_url).name
    ext = ''
    if dataset.file_type:
        if dataset.file_type.startswith('.'):
            ext = dataset.file_type
        else:
            guessed = mimetypes.guess_extension(dataset.file_type)
            ext = guessed or ''

    base, _ = os.path.splitext(blob_id)
    filename = f"{base}{ext}" if base else f"{blob_id}{ext}"

    # prepare temp dir
    temp_dir = tempfile.mkdtemp(prefix="akave_dl_")
    background_tasks.add_task(_remove_temp_directory, temp_dir)

    try:
        akave = AkaveLinkAPI()
        output_path = akave.download_file(
            bucket_name=dataset_id,
            file_name=blob_id,
            output_dir=temp_dir,
        )

        if not Path(output_path).is_file():
            raise HTTPException(status_code=500, detail="Downloaded file missing.")

        media_type, _ = mimetypes.guess_type(filename)
        media_type = media_type or 'application/octet-stream'

        return FileResponse(
            path=output_path,
            filename=filename,
            media_type=media_type,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {e}")