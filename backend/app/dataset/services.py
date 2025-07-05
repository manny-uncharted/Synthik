import re
from sqlalchemy.orm import Session
from typing import Tuple, List

from app.dataset.models import Dataset
from app.dataset.schemas import DatasetCreate
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logger import logger

def _camel_to_snake(name: str) -> str:
    # converts CamelCase or camelCase to snake_case
    s1 = re.sub(r'(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', s1).lower()

def create_dataset(db: Session, data: DatasetCreate, creator_id: str) -> Dataset:
    # 1) dump all fields
    payload = data.model_dump()

    # 2) drop the schema field entirely (if you don’t persist it directly)
    payload.pop("data_schema_fields", None)

    # 3) convert keys from camelCase to snake_case
    snake_payload = {
        _camel_to_snake(key): value
        for key, value in payload.items()
    }

    snake_payload.setdefault("dataset_type", "custom")

    # 4) now construct your ORM object
    ds = Dataset(**snake_payload, creator_id=creator_id)

    # 5) persist
    db.add(ds)
    db.commit()
    db.refresh(ds)
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
