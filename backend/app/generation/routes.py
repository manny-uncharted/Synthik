from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session


from app.core.database import get_db
from app.generation.schemas import PreviewRequest, PreviewResponse, TemplatesResponse
from app.generation.services import generate_preview, list_templates, get_generation_job
from app.core.exceptions import ValidationError

router = APIRouter(prefix="/generation", tags=["generation"])

@router.post(
    "/preview",
    response_model=PreviewResponse,
    status_code=status.HTTP_200_OK,
)
async def preview_dataset(request: PreviewRequest):
    """
    Generate a quick preview (max 50 rows) of a synthetic dataset
    based on the provided schema, model, and quality settings.
    """
    cfg = request.config

    # Pydantic already enforces rows <= 50 and quality regex,
    # but we can double-check business rules:
    if cfg.rows > 50:
        raise ValidationError("Preview supports up to 50 rows")

    preview, generation_time, estimated_cost = generate_preview(cfg)
    return PreviewResponse(
        preview=preview,
        generationTime=generation_time,
        estimatedCost=estimated_cost,
    )


@router.get(
    "/templates",
    response_model=TemplatesResponse,
    status_code=status.HTTP_200_OK,
)
async def get_templates():
    """
    Retrieve all available dataset-generation templates.
    """
    templates = list_templates()
    return TemplatesResponse(templates=templates)



@router.get(
    "/{job_id}",
    response_model=GenerationJobResponse,
)
async def read_generation_job(
    job_id: str,
    db: Session = Depends(get_db),
):
    """
    Fetch the status & result of a dataset-generation job.
    """
    job = get_generation_job(db, job_id)
    return job