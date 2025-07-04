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
    response_model=Dict[str, Any],  # {"dataset": DatasetResponse, "preview": [...], "generationJob": {...}}
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
    # parse tags
    tags_list = [t.strip() for t in tags.split(",") if t.strip()]

    preview: List[Dict[str, Any]] = []
    generated_file_path: Optional[str] = None
    file_format: Optional[str] = None

    if dataset_type == "upload":
        if not upload_file:
            raise HTTPException(400, "upload_file is required when dataset_type='upload'")
        # save upload
        tmp_dir = tempfile.mkdtemp()
        try:
            filename = upload_file.filename or f"{uuid.uuid4().hex}.csv"
            generated_file_path = os.path.join(tmp_dir, filename)
            with open(generated_file_path, "wb") as out:
                shutil.copyfileobj(upload_file.file, out)
            ext = pathlib.Path(filename).suffix.lower()
            file_format = ext.lstrip(".")
            preview = _extract_preview(generated_file_path, max_rows=5)
        finally:
            await upload_file.close()

    elif dataset_type == "custom":
        # config must be provided
        if not config:
            raise HTTPException(400, "config JSON is required when dataset_type='custom'")
        try:
            cfg = json.loads(config)
        except json.JSONDecodeError:
            raise HTTPException(400, "Invalid JSON in config")

        # use the registry to find & invoke the CSV generator
        registry = ToolRegistry()
        if data_type == "csv":
            tool = registry.get_tool("generate_synthetic_csv")
        elif data_type == "text":
            tool = registry.get_tool("generate_synthetic_text")
        elif data_type == "image":
            tool = registry.get_tool("generate_synthetic_image")
        else:
            raise HTTPException(400, f"Unknown data_type '{data_type}'")
        if not tool:
            raise HTTPException(500, f"Synthetic {data_type} tool not registered")

        # tool.invoke expects a dict matching CSVSchema:
        # result_str = tool.invoke({
        #     "columns": cfg["columns"],
        #     "rows": cfg["rows"],
        #     "output_path": cfg.get("output_path", "generated.csv"),
        #     "image_delay_seconds": cfg.get("image_delay_seconds", 1.0)
        # })
        result_str = await run_in_threadpool(lambda: tool.invoke({
            "columns": cfg["columns"],
            "rows": cfg["rows"],
            "output_path": cfg.get("output_path", "generated.csv"),
            "image_delay_seconds": cfg.get("image_delay_seconds", 1.0),
        }))
        result = json.loads(result_str)
        print("Result: ", result)
        generated_file_path = result["csv_path"]
        file_format = data_type
        preview = _extract_preview(generated_file_path, max_rows=5)

    elif dataset_type == "template":
        # template-based datasets could be handled similarly, omitted here
        raise HTTPException(501, "template-based datasets not yet implemented")
    else:
        raise HTTPException(400, f"Unknown dataset_type '{dataset_type}'")

    # build the DatasetCreate payload
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
    )

    # create DB records
    ds: Dataset = create_dataset(db, payload, creator_id=creator_id)
    job = create_generation_job(db, ds.id, creator_id, config=payload.dict())

    # You can enqueue a task if you need further processing; else return immediately
    # from app.datasets.tasks import finalize_dataset_generation
    # finalize_dataset_generation.delay(job.id)

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
