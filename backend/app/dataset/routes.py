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
    db: Session = Depends(get_db)
) -> DatasetResponse:
    tags_list = [t.strip() for t in tags.split(",") if t.strip()]

    preview: List[Dict[str, Any]] = []
    generated_file_path: Optional[str] = None
    file_format: Optional[str] = None
    storage_details: Optional[Dict[str, Any]] = None

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
        format=file_format
    )

    # Create the dataset record in the database
    ds: Dataset = create_dataset(db, payload, creator_id=creator_id)

    return DatasetResponse(
        id=ds.id,
        name=ds.name,
        description=ds.description,
        category=ds.category,
        tags=ds.tags,
        visibility=ds.visibility,
        license=ds.license,
        price=ds.price,
        pricePerRow=ds.price_per_row,
        datasetType=ds.dataset_type,
        format=ds.format
    )


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