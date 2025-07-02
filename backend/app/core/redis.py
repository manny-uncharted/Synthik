from contextlib import asynccontextmanager

# import aioredis
from redis.asyncio import Redis as AsyncRedis
# from aioredis import Redis as AsyncRedis
from typing import Optional

from app.core.constants import REDIS_URL

# Redis client (sync); pip install redis
redis_client = AsyncRedis.from_url(REDIS_URL)


redis_client_ml_ops: Optional[AsyncRedis] = None

async def get_redis_ml_ops() -> AsyncRedis:
    global redis_client_ml_ops
    if redis_client_ml_ops is None:
        redis_client_ml_ops = await get_redis_pool()
    return redis_client_ml_ops


async def get_redis_pool() -> AsyncRedis:
    pool = AsyncRedis.from_url(REDIS_URL, max_connections=40)
    print("connection redis: ", pool)
    return pool


async def get_redis_connection():
    pool = await get_redis_pool()  # Acquire the connection pool
    async with pool as conn:  # Acquire a connection from the pool
        yield conn


@asynccontextmanager
async def get_redis_session(redis_pool: AsyncRedis):
    # Get a connection from the pool
    redis = await redis_pool.acquire()

    try:
        # Yield the connection for use in the with block
        yield redis
    finally:
        # Release the connection back to the pool
        redis_pool.release(redis)
