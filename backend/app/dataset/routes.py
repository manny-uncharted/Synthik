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

@router.post("", status_code=status.HTTP_201_CREATED, response_model=DatasetResponse)
async def create_dataset_endpoint(
    creator_id: str = Form(...),
    name: str = Form(...),
    description: str = Form(...),
    category: str = Form(...),
    tags: str = Form("", description="Comma-separated tags"),
    visibility: str = Form("public"),
    license: str = Form(...),
    price: float = Form(0.0, ge=0.0),
    price_per_row: float = Form(0.0, ge=0.0),
    metadata_cid: str = Form(...),
    dataset_preview_cid: str = Form(...),
    dataset_cid: str = Form(...),
    data_schema_fields: str = Form(None, description="JSON array of schema fields for custom/template datasets"),
    format: str = Form(None, description="Data format: json, csv, parquet, png, jpg, jpeg, gif, webp"),
    file: UploadFile = File(None, description="Dataset file for upload type (CSV)"),
    db: Session = Depends(get_db)
) -> DatasetResponse:
    # Parse tags into a list
    tags_list = [t.strip() for t in tags.split(",") if t.strip()]

    # Prepare variables
    preview: List[Dict[str, Any]] = []
    schema_fields: List[Dict[str, Any]] = []
    file_format: Optional[str] = format

    # Handle file uploads (CSV) to auto-generate schema and preview
    if file:
        # Save uploaded file to a temp location
        tmp = tempfile.NamedTemporaryFile(delete=False)
        try:
            shutil.copyfileobj(file.file, tmp)
            tmp.flush()
            tmp_path = tmp.name
        finally:
            tmp.close()

        # Derive format from filename if not explicitly provided
        if not file_format:
            ext = pathlib.Path(file.filename).suffix.lstrip(".").lower()
            file_format = ext

        # Extract a small preview for the client
        preview = _extract_preview(tmp_path, max_rows=5)

        # Auto-generate schema from CSV headers
        with open(tmp_path, newline="", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames or []
        for col in headers:
            schema_fields.append({
                "id": str(uuid.uuid4()),
                "name": col,
                "type": "string",  # defaulting to string; adjust as needed
                "description": None,
                "constraints": {}
            })

        # Clean up temp file
        try:
            os.remove(tmp_path)
        except Exception:
            pass

    # For custom or template datasets, parse provided schema JSON
    if data_schema_fields and not schema_fields:
        try:
            schema_fields = json.loads(data_schema_fields)
        except json.JSONDecodeError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid JSON for data_schema_fields: {e}"
            )

    # Ensure required fields are present
    if not schema_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="data_schema_fields are required for dataset creation"
        )
    if not file_format:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="format is required for dataset creation"
        )

    # Build the Pydantic payload
    payload = DatasetCreate(
        name=name,
        description=description,
        category=category,
        tags=tags_list,
        format=file_format,
        data_schema_fields=schema_fields,
        visibility=visibility,
        license=license,
        price=price,
        pricePerRow=price_per_row,
        metadata_cid=metadata_cid,
        dataset_preview_cid=dataset_preview_cid,
        dataset_cid=dataset_cid
    )

    # Persist to DB
    ds: Dataset = create_dataset(db, payload, creator_id=creator_id)
    return DatasetResponse.from_orm(ds)

@router.get("", response_model=DatasetListResponse)
async def read_list(
    page: int = Query(1, gt=0),
    limit: int = Query(20, gt=0, le=100),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
) -> DatasetListResponse:
    cache_key = f"datasets:{page}:{limit}:{search or ''}"
    redis = RedisCache()

    # Attempt cache lookup
    try:
        cached = await redis.get(cache_key)
    except Exception as e:
        logger.warning("redis.get_failed", error=str(e))
        cached = None

    if cached:
        logger.info("cache.hit", key=cache_key)
        return DatasetListResponse(**cached)

    # Query database
    items, total = list_datasets(db, page, limit, search)
    total_pages = (total + limit - 1) // limit
    response = DatasetListResponse(
        datasets=items,
        page=page,
        limit=limit,
        total=total,
        totalPages=total_pages
    )

    # Cache the result (best-effort)
    try:
        await redis.set(cache_key, response.dict(by_alias=True))
    except Exception as e:
        logger.warning("redis.set_failed", error=str(e))

    return response

@router.get("/{dataset_id}", response_model=DatasetResponse)
async def read_one(
    dataset_id: str,
    db: Session = Depends(get_db)
) -> DatasetResponse:
    ds = get_dataset(db, dataset_id)
    return ds
