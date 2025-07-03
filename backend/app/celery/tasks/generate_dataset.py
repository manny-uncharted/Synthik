from celery import shared_task
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.logger import logger
from app.generation.models import GenerationJob
from datetime import datetime
import time



# cost per row by quality (reuse your pricing)
_COST_PER_ROW = {
    "fast": 0.0001,
    "balanced": 0.0002,
    "high": 0.0003,
}

@shared_task(bind=True, name="generate_dataset_preview")
def generate_dataset_preview(self, job_id: str) -> None:
    """
    Long-running task to generate dataset preview and update the GenerationJob record.
    """
    db: Session = SessionLocal()
    try:
        job = db.query(GenerationJob).get(job_id)
        if not job:
            logger.error("job.not_found", job_id=job_id)
            return
        # mark running
        job.status = "running"
        job.progress = 0
        db.commit()

        cfg = job.config
        # simulate generation
        start = time.time()
        preview = []
        for _ in range(cfg["rows"]):
            row = {f["name"]: f"default_{f['type']}" for f in cfg["schema"]}
            preview.append(row)
        duration = time.time() - start
        cost = cfg["rows"] * _COST_PER_ROW[cfg["quality"]]

        # update result
        job.result = {
            "preview": preview,
            "generationTime": duration,
            "estimatedCost": cost,
        }
        job.progress = 100
        job.status = "completed"
        job.completed_at = datetime.utcnow()
        db.commit()
        logger.info("job.completed", job_id=job_id)
    except Exception as exc:
        logger.error("job.failed", job_id=job_id, error=str(exc))
        # update job record
        job = db.query(GenerationJob).get(job_id)
        if job:
            job.status = "failed"
            job.error = str(exc)
            db.commit()
        # retry
        raise self.retry(exc=exc, countdown=30, max_retries=3)
    finally:
        db.close()
