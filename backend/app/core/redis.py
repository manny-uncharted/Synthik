from contextlib import asynccontextmanager
from redis.asyncio import Redis as AsyncRedis
import json
from typing import Optional, Any

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


class RedisCache:
    def __init__(self, url: str = REDIS_URL):
        self.redis = AsyncRedis.from_url(url, encoding="utf8", decode_responses=True)

    async def get(self, key: str) -> Optional[Any]:
        data = await self.redis.get(key)
        return json.loads(data) if data else None

    async def set(self, key: str, value: Any, expire: int = 300) -> None:
        await self.redis.set(key, json.dumps(value), ex=expire)