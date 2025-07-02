import uuid
from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, DateTime, Float
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class AnnotationTask(Base):
    __tablename__ = 'annotation_tasks'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    campaign_id = Column(String, ForeignKey("campaigns.id"), nullable=False)
    data_cid = Column(String, index=True)
    data_type = Column(String, index=True)  # TEXT, IMAGE, CSV, VIDEO, AUDIO
    status = Column(String, default="pending", index=True)
    final_annotation = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    campaign = relationship("Campaign")
    annotations = relationship('Annotation', back_populates='task')


class Annotation(Base):
    __tablename__ = 'annotations'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    task_id = Column(String, ForeignKey('annotation_tasks.id'))
    user_id = Column(String, ForeignKey('users.id'))
    annotator_wallet = Column(String, ForeignKey('users.wallet_address'))
    labels = Column(JSONB, nullable=False)
    is_honeypot_submission = Column(Boolean, default=False)
    llm_suggestion_score = Column(Float, nullable=True) # Score before/after LLM feedback
    created_at = Column(DateTime, default=datetime.utcnow)
    timestamp = Column(DateTime, default=datetime.utcnow)


    task = relationship('AnnotationTask', back_populates='annotations')
    user = relationship("User", back_populates="annotations")