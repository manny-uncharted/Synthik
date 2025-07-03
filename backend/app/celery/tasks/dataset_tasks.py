from celery import shared_task
from sqlalchemy.orm import Session




from app.core.database import SessionLocal
from app.core.logger import logger
from app.dataset.services import get_dataset
from app.dataset.models import Dataset



@shared_task(bind=True, name="generate_dataset_preview")
def generate_dataset_preview(self, dataset_id: str):
    """
    Long-running task to generate dataset preview and update the record.
    """
    logger.info("task.start", task="generate_dataset_preview", dataset_id=dataset_id)
    db: Session = SessionLocal()
    try:
        ds = get_dataset(db, dataset_id)
        # placeholder: call your generation engine here
        preview = [{"example": "row"}]
        ds.preview_rows = len(preview)
        ds.preview_filecoin_cid = "QmExampleCID"
        ds.status = "ready"
        db.commit()
        logger.info("task.success", dataset_id=dataset_id)
    except Exception as exc:
        logger.error("task.failed", dataset_id=dataset_id, error=str(exc))
        ds = db.query(Dataset).get(dataset_id)
        if ds:
            ds.status = "failed"
            db.commit()
        raise self.retry(exc=exc, countdown=30, max_retries=3)
    finally:
        db.close()
