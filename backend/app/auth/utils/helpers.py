import logging
import datetime
from fastapi import HTTPException, status

from app.core.redis import redis_client

logger = logging.getLogger(__name__)


def _get_token_from_header(authorization: str) -> str:
    """
    Parses "Bearer <token>".
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header",
        )
    return authorization.split(" ", 1)[1].strip()


def _cache_token(secret: str, user_id: str, expires_at: datetime.datetime):
    """
    Store token in Redis with TTL = expires_at - now.
    """
    ttl = int((expires_at - datetime.datetime.utcnow()).total_seconds())
    if ttl > 0:
        redis_client.setex(secret, ttl, user_id)
    else:
        logger.warning("Attempted to cache a token that is already expired.")
