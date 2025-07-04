from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Form,
    File,
    Query,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import csv
import tempfile
import shutil
import os
import pathlib
import re
import json
import uuid
from fastapi.concurrency import run_in_threadpool

from app.dataset.schemas import DatasetCreate, DatasetResponse, DatasetListResponse
from app.dataset.models import Dataset
from app.dataset.services import create_dataset, get_dataset, list_datasets
from app.core.database import get_db
from app.core.redis import RedisCache
from app.core.logger import logger
from app.generation.services import create_generation_job
from app.generation.synthetic_generation_tools import ToolRegistry

router = APIRouter(prefix="/datasets", tags=["datasets"])

def _extract_preview(file_path: str, max_rows: int = 5) -> List[Dict[str, Any]]:
    """
    Read the first `max_rows` of a CSV file at file_path.
    """
    preview: List[Dict[str, Any]] = []
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace", newline="") as f:
            reader = csv.DictReader(f)
            for i, row in enumerate(reader):
                if i >= max_rows:
                    break
                preview.append(row)
    except Exception:
        pass
    return preview

@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=Dict[str, Any],
)
async def create_dataset_endpoint(
    creator_id: str = Form(...),
    name: str = Form(...),
    description: str = Form(...),
    category: str = Form(...),
    tags: str = Form("", description="Comma-separated tags"),
    visibility: str = Form("public"),
    license: str = Form(...),
    price: float = Form(0.0),
    price_per_row: float = Form(0.0),
    data_type: str = Form("csv", description="csv|text|image"),
    dataset_type: str = Form("upload", description="upload|custom|template"),
    template_id: Optional[str] = Form(None),
    config: Optional[str] = Form(None, description="JSON string for synthetic generation config"),
    upload_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    tags_list = [t.strip() for t in tags.split(",") if t.strip()]

    preview: List[Dict[str, Any]] = []
    generated_file_path: Optional[str] = None
    file_format: Optional[str] = None
    storage_details: Optional[Dict[str, Any]] = None

    if dataset_type == "upload":
        if not upload_file:
            raise HTTPException(400, "upload_file is required when dataset_type='upload'")

        tmp_dir = tempfile.mkdtemp()
        try:
            filename = upload_file.filename or f"{uuid.uuid4().hex}.csv"
            local_file_path = os.path.join(tmp_dir, filename)

            # Save the uploaded file to the temporary directory
            with open(local_file_path, "wb") as out:
                shutil.copyfileobj(upload_file.file, out)

            ext = pathlib.Path(filename).suffix.lower()
            file_format = ext.lstrip(".") if ext else data_type
            preview = _extract_preview(local_file_path, max_rows=5)

            # --- Akave Upload Logic ---
            akave_api = AkaveLinkAPI()
            bucket_name = "user-dataset-uploads"

            def _upload_to_akave():
                """Blocking function to run in a threadpool."""
                try:
                    akave_api.create_bucket(bucket_name)
                    logger.info(f"Bucket '{bucket_name}' created or already exists.")
                except AkaveLinkAPIError as e:
                    logger.warning(f"Could not create bucket (assuming it already exists): {e}")
                
                # Upload the file from the temporary path
                response = akave_api.upload_file(bucket_name, local_file_path)
                return response

            try:
                logger.info(f"Uploading '{filename}' to Akave bucket '{bucket_name}'...")
                storage_details = await run_in_threadpool(_upload_to_akave)
                logger.info("File successfully uploaded to Akave.", details=storage_details)
                # The path to the file in Akave's storage
                generated_file_path = storage_details.get("path")
            except AkaveLinkAPIError as e:
                logger.error(f"Failed to upload file to Akave: {e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to store dataset file in Akave: {e}"
                )
            # --- End Akave Upload Logic ---

        finally:
            # Clean up the local temporary directory and close the file handle
            if os.path.exists(tmp_dir):
                shutil.rmtree(tmp_dir)
            await upload_file.close()

    elif dataset_type == "custom":
        if not config:
            raise HTTPException(400, "config JSON is required when dataset_type='custom'")
        try:
            cfg = json.loads(config)
        except json.JSONDecodeError:
            raise HTTPException(400, "Invalid JSON in config")

        registry = ToolRegistry()
        tool_name_map = {
            "csv": "generate_synthetic_csv",
            "text": "generate_synthetic_text",
            "image": "generate_synthetic_image",
        }
        tool = registry.get_tool(tool_name_map.get(data_type))
        if not tool:
            raise HTTPException(500, f"Synthetic {data_type} tool not registered")

        result_str = await run_in_threadpool(lambda: tool.invoke({
            "columns": cfg.get("columns", []),
            "rows": cfg.get("rows", 0),
            "output_path": cfg.get("output_path", f"generated.{data_type}"),
            "image_delay_seconds": cfg.get("image_delay_seconds", 1.0),
        }))
        result = json.loads(result_str)
        generated_file_path = result.get("csv_path") or result.get("output_path")
        file_format = data_type
        if generated_file_path:
             preview = _extract_preview(generated_file_path, max_rows=5)

    elif dataset_type == "template":
        raise HTTPException(501, "template-based datasets not yet implemented")
    else:
        raise HTTPException(400, f"Unknown dataset_type '{dataset_type}'")

    # Build the DatasetCreate payload, including Akave storage details for uploads
    payload = DatasetCreate(
        name=name,
        description=description,
        category=category,
        tags=tags_list,
        visibility=visibility,
        license=license,
        price=price,
        pricePerRow=price_per_row,
        datasetType=dataset_type,
        format=file_format,
        storageDetails=storage_details, # Pass Akave response to the service layer
    )

    # Create the dataset record in the database
    ds: Dataset = create_dataset(db, payload, creator_id=creator_id)
    job = create_generation_job(db, ds.id, creator_id, config=payload.dict())

    return {
        "dataset": ds,
        "preview": preview,
        "generationJob": job,
    }


@router.get("", response_model=DatasetListResponse)
async def read_list(
    page: int = Query(1, gt=0),
    limit: int = Query(20, gt=0, le=100),
    search: str = Query(None),
    db: Session = Depends(get_db),
):
    cache_key = f"datasets:{page}:{limit}:{search}"
    redis = RedisCache()
    cached = await redis.get(cache_key)
    if cached:
        logger.info("cache.hit", key=cache_key)
        return cached

    items, total = list_datasets(db, page, limit, search)
    total_pages = (total + limit - 1) // limit
    resp = DatasetListResponse(
        datasets=items,
        page=page,
        limit=limit,
        total=total,
        totalPages=total_pages,
    )
    await redis.set(cache_key, resp.model_dump())
    return resp


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def read_one(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    ds = get_dataset(db, dataset_id)
    return ds