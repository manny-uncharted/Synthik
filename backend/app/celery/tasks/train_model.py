import time
from celery import shared_task
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.core.logger import logger
from app.ai_training.services import get_model
from app.ai_training.models import Model



@shared_task(bind=True, name="train_model")
def train_model(self, model_id: str) -> None:
    """
    Long-running task to train a model and update the record.
    """
    logger.info("task.start", task="train_model", model_id=model_id)
    db: Session = SessionLocal()
    try:
        m = get_model(db, model_id)
        # mark running
        m.status = "training"
        db.commit()

        # === replace with real training call ===
        total_steps = 5
        for step in range(1, total_steps + 1):
            time.sleep(10)  # simulate work
            # here you could update m.metrics or m.progress if you had a field

        # stub results
        m.accuracy = 0.92
        m.metrics = {"f1Score": 0.91, "precision": 0.93, "recall": 0.90}
        m.filecoin_cid = "QmModelCID123"
        m.status = "ready"
        m.trained_date = datetime.utcnow()

        db.commit()
        logger.info("task.success", model_id=model_id)
    except Exception as exc:
        logger.error("task.failed", model_id=model_id, error=str(exc))
        m = db.query(Model).get(model_id)
        if m:
            m.status = "failed"
            db.commit()
        raise self.retry(exc=exc, countdown=60, max_retries=3)
    finally:
        db.close()
