from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from typing import List


from app.dataset.schemas import DatasetCreate, DatasetResponse, DatasetListResponse
from app.dataset.services import create_dataset, get_dataset, list_datasets
from app.core.database import get_db
from app.core.redis import RedisCache
from app.core.logger import logger
from app.celery.tasks import generate_dataset_preview
from app.generation.services import create_generation_job

router = APIRouter(prefix="/datasets", tags=["datasets"])

@router.post(
    "",
    response_model=DatasetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create(
    payload: DatasetCreate,
    db: Session = Depends(get_db),
    # assume you have current_user from your auth middleware
    current_user: str = Depends(...),
):
    # create the dataset record
    ds = create_dataset(db, payload, creator_id=current_user)

    # create a generation‐job record
    job = create_generation_job(db, ds.id, current_user, config=payload.model_dump())

    # enqueue the Celery task with that job ID
    from app.celery.tasks.dataset_tasks import generate_dataset_preview
    generate_dataset_preview.delay(job.id)

    return {"dataset": ds, "generationJob": job}

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
