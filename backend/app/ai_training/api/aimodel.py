# app/ai_training/api/aimodel.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.ai_training.models import Model
from app.ai_training.schemas import ModelResponse, ModelListResponse

router = APIRouter(prefix="/models", tags=["Models"])

@router.get("", response_model=ModelListResponse)
def list_models(
    page: int = Query(1, gt=0),
    limit: int = Query(20, gt=0, le=100),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Model)
    if search:
        q = q.filter(Model.name.ilike(f"%{search}%"))
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    total_pages = (total + limit - 1) // limit
    return ModelListResponse(
        models=items, page=page, limit=limit, total=total, totalPages=total_pages
    )

@router.get("/{model_id}", response_model=ModelResponse)
def get_model(model_id: str, db: Session = Depends(get_db)):
    m = db.get(Model, model_id)
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    return ModelResponse.from_orm(m)
