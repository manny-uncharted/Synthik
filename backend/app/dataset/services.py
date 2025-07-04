from sqlalchemy.orm import Session
from typing import Tuple, List

from app.dataset.models import Dataset
from app.dataset.schemas import DatasetCreate
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logger import logger

def create_dataset(db: Session, data: DatasetCreate, creator_id: str) -> Dataset:
    ds = Dataset(**data.model_dump(), creator_id=creator_id)
    db.add(ds)
    db.commit()
    db.refresh(ds)
    logger.info("dataset.created", dataset_id=ds.id, creator=creator_id)
    return ds

def get_dataset(db: Session, dataset_id: str) -> Dataset:
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise NotFoundError(f"Dataset {dataset_id} not found")
    return ds

def list_datasets(
    db: Session,
    page: int = 1,
    limit: int = 20,
    search: str = None,
) -> Tuple[List[Dataset], int]:
    query = db.query(Dataset)
    if search:
        query = query.filter(Dataset.name.ilike(f"%{search}%"))
    total = query.count()
    items = query.offset((page - 1) * limit).limit(limit).all()
    return items, total
