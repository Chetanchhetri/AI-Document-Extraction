"""Shared FastAPI dependencies: sessions, authentication, RBAC, rate limiting."""
from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.core.redis import get_store
from app.core.security import TokenError, decode_token, ensure_token_active
from app.models import Role, User
from app.models.enums import ROLE_RANK

bearer_scheme = HTTPBearer(auto_error=False)


def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail, headers={"WWW-Authenticate": "Bearer"})


async def get_access_claims(creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> dict[str, Any]:
    if creds is None:
        raise _unauthorized()
    try:
        claims = decode_token(creds.credentials, "access")
        await ensure_token_active(claims)
    except TokenError as exc:
        raise _unauthorized(str(exc)) from exc
    return claims


async def get_current_user(
    claims: dict[str, Any] = Depends(get_access_claims), session: AsyncSession = Depends(get_session)
) -> User:
    user = await session.get(User, int(claims["sub"]))
    if user is None or not user.is_active or not user.is_verified:
        raise _unauthorized("Account unavailable")
    return user  # role is read from the DB, never trusted from the token


def require_role(minimum: Role):
    async def checker(user: User = Depends(get_current_user)) -> User:
        if ROLE_RANK[user.role] < ROLE_RANK[minimum]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return user

    return checker


require_executive = require_role(Role.executive)
require_manager = require_role(Role.manager)
require_super_admin = require_role(Role.super_admin)


def rate_limit(scope: str):
    """Sliding-window limiter (Redis sorted set): N requests / window per client IP per route."""

    async def limiter(request: Request) -> None:
        ip = request.client.host if request.client else "unknown"
        allowed, retry_after = await get_store().sliding_window_hit(
            f"rl:{scope}:{ip}", settings.AUTH_RATE_LIMIT_WINDOW_SECONDS, settings.AUTH_RATE_LIMIT_MAX)
        if not allowed:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests, try again later",
                                headers={"Retry-After": str(retry_after)})

    return limiter
