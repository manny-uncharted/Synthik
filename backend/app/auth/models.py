import datetime
import uuid
from sqlalchemy import Boolean, Column, DateTime, String, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.core.enums.user_types import UserType


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    wallet_address = Column(String, unique=True, index=True)
    roles = Column(JSONB, default=lambda: [UserType.SUPPORT])
    permissions = Column(JSONB, default=list)
    mfa_enabled = Column(Boolean, default=False)
    mfa_secret = Column(String(32), nullable=True)
    is_active = Column(Boolean, default=True)
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.datetime.utcnow)

    tokens = relationship("Token", back_populates="user")
    profiles = relationship("Profile", back_populates="user")
    annotations = relationship("Annotation", back_populates="user")



class Token(Base):
    __tablename__ = "tokens"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    secret_access_key = Column(String, nullable=False) # This is a mix of the user's wallet address and a random string when they connect their wallet this is generated
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.datetime.utcnow)

    user = relationship("User", back_populates="tokens")


class Profile(Base):
    __tablename__ = 'profiles'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(String, unique=True, index=True)
    is_verified = Column(Boolean, default=False)
    verification_scores = Column(JSONB, default=[])
    reputation_score = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="profiles")