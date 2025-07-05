from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.ai_training.models import AITrainingJob, UserExternalServiceCredential
from app.ai_training.schemas import (
    AITrainingJobCreate,
    AITrainingJobResponse,
)
from app.core.enums.ai_training import JobStatus
from app.ai_training.services import submit_training_job_to_platform

router = APIRouter(prefix="/training-jobs", tags=["Training Jobs"])


@router.post(
    "",
    response_model=AITrainingJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def create_training_job(
    job_in: AITrainingJobCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> AITrainingJobResponse:
    # Validate credential if provided
    if job_in.user_credential_id:
        cred = db.get(UserExternalServiceCredential, job_in.user_credential_id)
        if not cred:
            raise HTTPException(status_code=404, detail="Credential not found.")
        if cred.platform != job_in.platform:
            raise HTTPException(status_code=400, detail="Credential/Job platform mismatch.")
        if cred.user_wallet_address != job_in.user_wallet_address:
            raise HTTPException(status_code=403, detail="Credential does not belong to user.")

    # Create the DB record
    db_job = AITrainingJob(**job_in.model_dump())
    db_job.status = JobStatus.PENDING
    db.add(db_job)
    db.commit()
    db.refresh(db_job)

    # Kick off the background submission
    background_tasks.add_task(
        submit_training_job_to_platform,
        job_id=db_job.id,
        db_provider=get_db,
    )

    return AITrainingJobResponse.from_orm(db_job)


@router.get(
    "/{job_id}",
    response_model=AITrainingJobResponse,
)
def get_training_job(
    job_id: str,
    db: Session = Depends(get_db),
) -> AITrainingJobResponse:
    job = db.get(AITrainingJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found.")
    return AITrainingJobResponse.from_orm(job)


@router.get(
    "/by-user/{user_wallet}",
    response_model=list[AITrainingJobResponse],
)
def list_training_jobs_by_user(
    user_wallet: str,
    status: JobStatus | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
) -> list[AITrainingJobResponse]:
    query = db.query(AITrainingJob).filter(AITrainingJob.user_wallet_address == user_wallet)
    if status:
        query = query.filter(AITrainingJob.status == status)
    jobs = query.order_by(AITrainingJob.created_at.desc()).offset(skip).limit(limit).all()
    return [AITrainingJobResponse.from_orm(j) for j in jobs]
