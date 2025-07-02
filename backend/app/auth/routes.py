# app/users/routers/auth.py

import uuid
import logging
import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
import redis

from app.core.database import get_db

from app.auth.services import UserService
from app.auth.schemas import TokenResponse, LoginRequest
from app.auth.utils.helpers import _cache_token, _get_token_from_header, redis_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])




@router.post(
    "/wallet-connect",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
def login(
    data: LoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """
    Log in (or sign up) a user by wallet_address.
    Generates a new Token, stores it in the DB and caches in Redis.
    """
    # 1) get or create user
    user = UserService.create_user(db, data.wallet_address)

    # 2) create a new token record
    token_obj = UserService.create_token(db, user)

    # 3) cache in Redis
    _cache_token(token_obj.secret_access_key, user.id, token_obj.expires_at)

    return TokenResponse(
        access_token=token_obj.secret_access_key,
        expires_at=token_obj.expires_at,
    )


@router.get(
    "/token",
    response_model=TokenResponse,
)
def refresh_token(
    authorization: str = Header(..., description="Bearer access token"),
    db: Session = Depends(get_db),
) -> TokenResponse:
    """
    Checks whether the provided token is still cached in Redis.
     - If it is, returns it.
     - If not (i.e. TTL expired), issues a brand-new token.
    """
    secret = _get_token_from_header(authorization)

    # 1) Quick Redis check
    user_id = redis_client.get(secret)
    if user_id:
        # still valid
        tok = UserService.get_active_token(db, secret)
        if not tok:
            # Shouldn’t happen: cached but not in DB
            logger.error("Token present in Redis but missing/expired in DB")
            raise HTTPException(status_code=401, detail="Invalid token")
        return TokenResponse(access_token=secret, expires_at=tok.expires_at)

    # 2) Not in Redis → expired or invalid
    old_tok = UserService.get_token(db, secret, include_expired=True)
    if not old_tok:
        raise HTTPException(status_code=401, detail="Invalid token")

    # 3) Issue new token for same user
    new_tok = UserService.refresh_token(db, old_tok.user)
    _cache_token(new_tok.secret_access_key, old_tok.user.id, new_tok.expires_at)

    return TokenResponse(
        access_token=new_tok.secret_access_key,
        expires_at=new_tok.expires_at,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    authorization: str = Header(..., description="Bearer access token"),
    db: Session = Depends(get_db),
):
    """
    Revokes a token immediately (DB + Redis).
    """
    secret = _get_token_from_header(authorization)
    tok = UserService.get_token(db, secret, include_expired=True)
    if tok:
        UserService.delete_token(db, tok.id)
        redis_client.delete(secret)
    return None  # 204 No Content
