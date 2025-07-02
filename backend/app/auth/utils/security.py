# app/admin/utils/security.py

import logging
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.services import UserService
from app.auth.models import User
from app.core.database import get_db

logger = logging.getLogger(__name__)

# OAuth2 scheme for wallet-based authentication
user_oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/auth/wallet-connect",
    scheme_name="UserWalletAuth",
)

async def get_current_user(
    token: str = Depends(user_oauth2_scheme),
    session: AsyncSession = Depends(get_db),
) -> User:
    """Retrieve and validate the current user via token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    user = await UserService.get_by_token(token, session)
    if not user or not user.is_active:
        raise credentials_exception
    return user


def require_user_roles(roles: list[str]):
    """Dependency to enforce required user roles."""
    def role_checker(user: User = Depends(get_current_user)) -> User:
        if not any(role in user.roles for role in roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user
    return role_checker


def require_user_permissions(permissions: list[str]):
    """Dependency to enforce required user permissions."""
    def permission_checker(user: User = Depends(get_current_user)) -> User:
        user_perms = set(user.permissions) | set(
            UserService.get_role_permissions(user.roles)
        )
        if not user_perms.intersection(permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user
    return permission_checker

# Specific role-based dependencies
require_wallet_user = require_user_roles(['USER'])
require_wallet_creator = require_user_roles(['CREATOR'])
require_wallet_annotator = require_user_roles(['ANNOTATOR'])
require_wallet_advertiser = require_user_roles(['ADVERTISER'])
require_wallet_sponsor = require_user_roles(['SPONSOR'])
require_wallet_finance = require_user_roles(['FINANCE'])
require_wallet_support = require_user_roles(['SUPPORT'])
require_wallet_analytics = require_user_roles(['ANALYTICS'])
require_wallet_reviewer = require_user_roles(['REVIEWER'])
require_wallet_admin = require_user_roles(['ADMIN'])
require_wallet_superadmin = require_user_roles(['SUPERADMIN'])
