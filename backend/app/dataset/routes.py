from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Form,
    File,
    Query,
    Body,
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
    response_model=DatasetResponse,
)
async def create_dataset_json(
    creator_id: str = Body(..., embed=True),
    payload: DatasetCreate = Body(...),
    db: Session = Depends(get_db),
):
    if not payload.data_schema_fields:
        raise HTTPException(status_code=400, detail="`data_schema_fields` is required.")
    if not payload.format:
        raise HTTPException(status_code=400, detail="`format` is required.")

    ds = create_dataset(db, payload, creator_id=creator_id)
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
