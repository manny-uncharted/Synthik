# app/admin/tasks/token_cleanup.py
"""
Celery task to purge expired access tokens from the database.
"""
import asyncio
import logging
from datetime import datetime

from celery import shared_task
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete

from app.core.database import get_db
from app.auth.models import Token

logger = logging.getLogger(__name__)

@shared_task
def purge_expired_tokens():
    """Remove all tokens whose expiry has passed."""
    async def _purge():
        async with get_db() as session:
            now = datetime.utcnow()
            stmt = delete(Token).where(Token.expires_at < now)
            result = await session.execute(stmt)
            await session.commit()
            return result.rowcount

    deleted_count = asyncio.run(_purge())
    logger.info(f"Purged {deleted_count} expired tokens")
    return deleted_count
