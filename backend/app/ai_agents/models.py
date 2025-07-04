import uuid
from sqlalchemy import Column, String, DateTime, func as sql_func, Index, JSON
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class WorkflowDefinitionDB(Base):
    __tablename__ = "workflow_definitions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workflow_id_api = Column(String, unique=True, index=True, nullable=False) # API-facing ID
    name = Column(String, index=True, nullable=False)
    wallet_address = Column(String, index=True, nullable=False) # Creator's wallet
    definition = Column(JSON,nullable=False) # Stores the WFWorkflowDefinition TypedDict
    created_at = Column(DateTime(timezone=True), server_default=sql_func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=sql_func.now())

    __table_args__ = (Index("ix_workflow_definitions_wallet_name", "wallet_address", "name"),)