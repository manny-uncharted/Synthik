# app/admin/services/user_service.py
"""
Service layer for user-related operations, handling CRUD, authentication,
roles/permissions management, MFA, and token issuance/validation.
"""
from datetime import datetime, timedelta
import uuid
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload, Session

from app.auth.models import User, Token
from app.core.constants import JWT_EXPIRATION_MINUTES
from app.core.database import get_db
from app.core.enums.user_types import UserType


class UserService:
    @staticmethod
    async def create_user(
        wallet_address: str,
        session: AsyncSession,
        roles: Optional[List[str]] = None,
        permissions: Optional[List[str]] = None,
    ) -> User:
        """Register a new user or return existing."""
        existing = await UserService.get_by_wallet(wallet_address, session)
        if existing:
            return existing

        user = User(
            wallet_address=wallet_address,
            roles=roles or [UserType.USER.value],
            permissions=permissions or [],
            is_active=True,
            created_at=datetime.utcnow(),
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user

    @staticmethod
    async def get_by_id(user_id: str, session: AsyncSession) -> Optional[User]:
        """Retrieve a user by UUID."""
        result = await session.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_wallet(
        wallet_address: str, session: AsyncSession
    ) -> Optional[User]:
        """Retrieve a user by wallet address."""
        result = await session.execute(
            select(User).where(User.wallet_address == wallet_address)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_users(
        session: AsyncSession, offset: int = 0, limit: int = 100
    ) -> List[User]:
        """List users with pagination."""
        result = await session.execute(
            select(User).offset(offset).limit(limit)
        )
        return result.scalars().all()

    @staticmethod
    async def update_user(
        user: User,
        session: AsyncSession,
        **kwargs,
    ) -> User:
        """Update user fields."""
        for key, value in kwargs.items():
            setattr(user, key, value)
        user.updated_at = datetime.utcnow()
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user

    @staticmethod
    async def delete_user(user: User, session: AsyncSession) -> None:
        """Soft-delete or hard-delete a user."""
        # Here we soft-delete
        user.is_active = False
        user.updated_at = datetime.utcnow()
        session.add(user)
        await session.commit()

    # Roles & permissions management
    @staticmethod
    def get_role_permissions(roles: List[str]) -> List[str]:
        from app.auth.utils.roles import ROLE_PERMISSIONS
        perms = []
        for role in roles:
            perms.extend(ROLE_PERMISSIONS.get(role, []))
        return perms

    @staticmethod
    async def add_role(
        user: User, role: str, session: AsyncSession
    ) -> User:
        """Assign a role if not present."""
        if role not in user.roles:
            user.roles.append(role)
        return await UserService.update_user(user, session)

    @staticmethod
    async def remove_role(
        user: User, role: str, session: AsyncSession
    ) -> User:
        """Remove a role if present."""
        if role in user.roles:
            user.roles.remove(role)
        return await UserService.update_user(user, session)

    @staticmethod
    async def add_permission(
        user: User, permission: str, session: AsyncSession
    ) -> User:
        """Assign a custom permission."""
        if permission not in user.permissions:
            user.permissions.append(permission)
        return await UserService.update_user(user, session)

    @staticmethod
    async def remove_permission(
        user: User, permission: str, session: AsyncSession
    ) -> User:
        """Revoke a custom permission."""
        if permission in user.permissions:
            user.permissions.remove(permission)
        return await UserService.update_user(user, session)

    # Token issuance & validation
    @staticmethod
    def create_token(db: Session, user: User) -> Token:
        """
        Revoke any existing valid tokens, then issue a new one.
        """
        # expire old tokens immediately
        now = datetime.utcnow()
        db.query(Token).filter(
            Token.user_id == user.id,
            Token.expires_at > now
        ).update({Token.expires_at: now})
        db.commit()

        secret = f"{user.wallet_address}:{uuid.uuid4()}"
        expires_at = now + timedelta(minutes=TOKEN_EXPIRE_MINUTES)

        token = Token(
            user_id=user.id,
            secret_access_key=secret,
            expires_at=expires_at,
        )
        db.add(token)
        db.commit()
        db.refresh(token)
        return token

    @staticmethod
    def get_active_token(db: Session, secret: str) -> Optional[Token]:
        """
        Return the token object if it's not yet expired.
        """
        now = datetime.utcnow()
        return (
            db.query(Token)
            .filter(
                Token.secret_access_key == secret,
                Token.expires_at > now,
            )
            .one_or_none()
        )

    @staticmethod
    def get_token(
        db: Session, secret: str, include_expired: bool = False
    ) -> Optional[Token]:
        """
        Return the token object whether expired or not (unless include_expired=False).
        """
        q = db.query(Token).filter(Token.secret_access_key == secret)
        if not include_expired:
            q = q.filter(Token.expires_at > datetime.utcnow())
        return q.one_or_none()

    @staticmethod
    def refresh_token(db: Session, user: User) -> Token:
        """
        Shortcut to issue a brand-new token for the same user.
        """
        return UserService.create_token(db, user)

    @staticmethod
    def delete_token(db: Session, token_id: str) -> None:
        """
        Revoke a token by its ID (hard delete).
        """
        db.query(Token).filter(Token.id == token_id).delete()
        db.commit()

    # MFA management
    @staticmethod
    async def enable_mfa(
        user: User, secret: str, session: AsyncSession
    ) -> User:
        user.mfa_enabled = True
        user.mfa_secret = secret
        return await UserService.update_user(user, session)

    @staticmethod
    async def disable_mfa(
        user: User, session: AsyncSession
    ) -> User:
        user.mfa_enabled = False
        user.mfa_secret = None
        return await UserService.update_user(user, session)

    @staticmethod
    async def update_last_login(
        user: User, session: AsyncSession
    ) -> User:
        user.last_login = datetime.utcnow()
        return await UserService.update_user(user, session)
