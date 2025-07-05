# mlops_sdk/api/jobs.py

from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.orm import Session
from typing import Tuple

from app.core.database import get_db
from app.ai_training.models import AITrainingJob, TrainingPlatform, JobStatus
from app.ai_training.schemas import AITrainingJobCreate, AITrainingJobResponse, JobStatusResponse
from app.ai_training.trainers.base import BaseTrainer, TrainerError
from app.ai_training.trainers.local import LocalScriptTrainer
from app.ai_training.trainers.sagemaker import SageMakerTrainer
from app.ai_training.trainers.vertex import VertexAITrainer
from app.ai_training.trainers.hf_space import HFSpaceTrainer

router = APIRouter(prefix="/training-jobs", tags=["training-jobs"])


class TrainerFactory:
    @staticmethod
    def get_trainer(
        job: AITrainingJob,
        db: Session
    ) -> BaseTrainer:
        """
        Return the appropriate trainer for the job.platform.
        """
        common_kwargs = {
            "platform_job_id": job.id,
            "script_config": job.training_script_config,
            "credentials": job.user_credential,  # May be None for LOCAL_SERVER
            "db": db,
        }

        if job.platform == TrainingPlatform.LOCAL_SERVER:
            return LocalScriptTrainer(**common_kwargs)
        elif job.platform == TrainingPlatform.AWS_SAGEMAKER:
            return SageMakerTrainer(**common_kwargs)
        elif job.platform == TrainingPlatform.GOOGLE_VERTEX_AI:
            return VertexAITrainer(**common_kwargs)
        elif job.platform == TrainingPlatform.HUGGING_FACE:
            return HFSpaceTrainer(**common_kwargs)
        else:
            raise TrainerError(f"Unsupported training platform: {job.platform}")


@router.post(
    "",
    response_model=AITrainingJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def create_training_job(
    payload: AITrainingJobCreate,
    db: Session = Depends(get_db)
):
    # 1. Persist initial job record
    db_job = AITrainingJob(**payload.model_dump())
    db_job.status = JobStatus.PENDING
    db.add(db_job)
    db.commit()
    db.refresh(db_job)

    # 2. Instantiate the trainer and submit immediately
    try:
        trainer = TrainerFactory.get_trainer(db_job, db)
        external_id, new_status = trainer.submit()
    except TrainerError as e:
        # Mark job as failed on submission error
        db_job.status = JobStatus.FAILED
        db_job.error_message = str(e)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Submission failed: {e}"
        )

    # 3. Update DB record with external_job_id and new status
    db_job.external_job_id = external_id
    db_job.status = new_status
    db.commit()
    db.refresh(db_job)

    return AITrainingJobResponse.from_orm(db_job)


@router.get(
    "/{job_id}/status",
    response_model=JobStatusResponse,
    status_code=status.HTTP_200_OK,
)
def get_job_status(
    job_id: str,
    db: Session = Depends(get_db)
):
    # 1. Fetch the job
    job = db.query(AITrainingJob).filter_by(id=job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if not job.external_job_id:
        raise HTTPException(
            status_code=400,
            detail="Job has not been submitted to any platform yet"
        )

    # 2. Instantiate the same trainer and poll status
    try:
        trainer = TrainerFactory.get_trainer(job, db)
        current_status = trainer.status(job.external_job_id)
    except TrainerError as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch status: {e}"
        )

    # 3. Persist updated status and return
    job.status = current_status
    db.commit()
    return JobStatusResponse(job_id=job.id, status=current_status)
