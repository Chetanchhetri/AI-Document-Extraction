"""Key/value + sliding-window abstraction over Redis.

`REDIS_URL=memory://` selects an in-process implementation so the API can be run
(and tested) without Redis. It is refused in production because state would not
be shared between workers/restarts.
"""
from __future__ import annotations

import time
import uuid
from typing import Optional

from app.core.config import settings


class MemoryStore:
    def __init__(self) -> None:
        self._data: dict[str, tuple[str, Optional[float]]] = {}
        self._windows: dict[str, list[float]] = {}

    def _alive(self, key: str) -> bool:
        item = self._data.get(key)
        if item is None:
            return False
        if item[1] is not None and item[1] <= time.monotonic():
            self._data.pop(key, None)
            return False
        return True

    async def set(self, key: str, value: str, ex: Optional[int] = None) -> None:
        self._data[key] = (value, time.monotonic() + ex if ex else None)

    async def get(self, key: str) -> Optional[str]:
        return self._data[key][0] if self._alive(key) else None

    async def delete(self, *keys: str) -> None:
        for k in keys:
            self._data.pop(k, None)

    async def exists(self, key: str) -> bool:
        return self._alive(key)

    async def incr(self, key: str, ex: int) -> int:
        current = int(await self.get(key) or 0) + 1
        ttl_left = None
        if key in self._data and self._data[key][1] is not None:
            ttl_left = max(int(self._data[key][1] - time.monotonic()), 1)
        await self.set(key, str(current), ex=ttl_left or ex)
        return current

    async def sliding_window_hit(self, key: str, window: int, limit: int) -> tuple[bool, int]:
        now = time.time()
        hits = [t for t in self._windows.get(key, []) if t > now - window]
        if len(hits) >= limit:
            self._windows[key] = hits
            return False, max(int(hits[0] + window - now) + 1, 1)
        hits.append(now)
        self._windows[key] = hits
        return True, 0

    async def ping(self) -> bool:
        return True

    async def close(self) -> None:
        return None


class RedisStore:
    def __init__(self, url: str) -> None:
        from redis.asyncio import Redis

        self._r = Redis.from_url(url, decode_responses=True, socket_timeout=5, socket_connect_timeout=5)

    async def set(self, key: str, value: str, ex: Optional[int] = None) -> None:
        await self._r.set(key, value, ex=ex)

    async def get(self, key: str) -> Optional[str]:
        return await self._r.get(key)

    async def delete(self, *keys: str) -> None:
        if keys:
            await self._r.delete(*keys)

    async def exists(self, key: str) -> bool:
        return bool(await self._r.exists(key))

    async def incr(self, key: str, ex: int) -> int:
        value = await self._r.incr(key)
        if value == 1:
            await self._r.expire(key, ex)
        return int(value)

    async def sliding_window_hit(self, key: str, window: int, limit: int) -> tuple[bool, int]:
        now = time.time()
        pipe = self._r.pipeline()
        pipe.zremrangebyscore(key, 0, now - window)
        pipe.zcard(key)
        _, count = await pipe.execute()
        if count >= limit:
            oldest = await self._r.zrange(key, 0, 0, withscores=True)
            retry = int(oldest[0][1] + window - now) + 1 if oldest else window
            return False, max(retry, 1)
        pipe = self._r.pipeline()
        pipe.zadd(key, {f"{now}:{uuid.uuid4().hex[:8]}": now})
        pipe.expire(key, window)
        await pipe.execute()
        return True, 0

    async def ping(self) -> bool:
        return bool(await self._r.ping())

    async def close(self) -> None:
        await self._r.aclose()


_store: MemoryStore | RedisStore | None = None


def init_store() -> MemoryStore | RedisStore:
    global _store
    if _store is None:
        _store = MemoryStore() if settings.REDIS_URL.startswith("memory://") else RedisStore(settings.REDIS_URL)
    return _store


def get_store() -> MemoryStore | RedisStore:
    return _store or init_store()


async def close_store() -> None:
    global _store
    if _store is not None:
        await _store.close()
        _store = None
