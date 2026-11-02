"""Password hashing, dual-JWT issuing/rotation/revocation and OTP helpers."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import secrets
import time
import uuid
from dataclasses import dataclass
from typing import Any

import jwt
from passlib.context import CryptContext

from app.core.config import settings
from app.core.redis import get_store

pwd_context = CryptContext(
    schemes=["argon2"],
    deprecated="auto",
    argon2__type="ID",
    argon2__memory_cost=19456,  # 19 MiB (OWASP minimum profile) - friendly to 256/512 MB free instances
    argon2__time_cost=2,
    argon2__parallelism=1,
)
_DUMMY_HASH = pwd_context.hash("dummy-password-for-timing-equalisation")

ALGORITHM = "HS256"
ACCESS_TTL = settings.ACCESS_TOKEN_MINUTES * 60
REFRESH_TTL = settings.REFRESH_TOKEN_DAYS * 86400


class TokenError(Exception):
    pass


async def hash_password(password: str) -> str:
    return await asyncio.to_thread(pwd_context.hash, password)


async def verify_password(password: str, hashed: str | None) -> bool:
    """Always burns an Argon2 verification, even for unknown users (timing equalisation)."""
    ok = await asyncio.to_thread(pwd_context.verify, password, hashed or _DUMMY_HASH)
    return bool(hashed) and ok


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------
@dataclass
class TokenPair:
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str = "bearer"


def _encode(user_id: int, role: str, token_type: str, ttl: int, family: str) -> tuple[str, dict[str, Any]]:
    now = int(time.time())
    claims = {
        "sub": str(user_id), "role": role, "type": token_type, "jti": uuid.uuid4().hex,
        "fam": family, "iat": now, "exp": now + ttl, "iss": settings.JWT_ISSUER,
    }
    return jwt.encode(claims, settings.SECRET_KEY, algorithm=ALGORITHM), claims


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    try:
        claims = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[ALGORITHM], issuer=settings.JWT_ISSUER,
            options={"require": ["exp", "iat", "sub", "jti", "fam", "type"]},
        )
    except jwt.PyJWTError as exc:
        raise TokenError("Invalid or expired token") from exc
    if claims.get("type") != expected_type:
        raise TokenError("Wrong token type")
    return claims


async def issue_token_pair(user_id: int, role: str, family: str | None = None) -> TokenPair:
    family = family or uuid.uuid4().hex
    access, _ = _encode(user_id, role, "access", ACCESS_TTL, family)
    refresh, r_claims = _encode(user_id, role, "refresh", REFRESH_TTL, family)
    await get_store().set(f"fam:{family}", r_claims["jti"], ex=REFRESH_TTL)
    return TokenPair(access, refresh, ACCESS_TTL)


async def blacklist_token(claims: dict[str, Any]) -> None:
    ttl = max(int(claims["exp"] - time.time()), 1)
    await get_store().set(f"bl:{claims['jti']}", "1", ex=ttl)


async def revoke_family(family: str) -> None:
    await get_store().delete(f"fam:{family}")


async def revoke_all_user_tokens(user_id: int) -> None:
    """Invalidate every token issued before now (deactivation, role change, password reset)."""
    await get_store().set(f"tva:{user_id}", str(int(time.time()) + 1), ex=REFRESH_TTL)


async def ensure_token_active(claims: dict[str, Any]) -> None:
    store = get_store()
    if await store.exists(f"bl:{claims['jti']}"):
        raise TokenError("Token revoked")
    if claims["type"] == "access" and not await store.exists(f"fam:{claims['fam']}"):
        raise TokenError("Session ended")
    valid_after = await store.get(f"tva:{claims['sub']}")
    if valid_after and claims["iat"] < int(valid_after):
        raise TokenError("Token revoked")


async def rotate_refresh_token(token: str) -> tuple[dict[str, Any], str]:
    """Validate a refresh token, enforce one-time use and return (claims, family)."""
    claims = decode_token(token, "refresh")
    store = get_store()
    current = await store.get(f"fam:{claims['fam']}")
    if current is None:
        raise TokenError("Session ended")
    if current != claims["jti"]:
        # A rotated-out refresh token was replayed => assume theft, kill the whole family.
        await revoke_family(claims["fam"])
        raise TokenError("Refresh token reuse detected")
    await ensure_token_active(claims)
    await blacklist_token(claims)
    return claims, claims["fam"]


# ---------------------------------------------------------------------------
# OTP
# ---------------------------------------------------------------------------
def _otp_digest(email: str, code: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()


async def issue_otp(email: str) -> str:
    email = email.lower()
    code = f"{secrets.randbelow(1_000_000):06d}"
    store = get_store()
    await store.set(f"otp:{email}", _otp_digest(email, code), ex=settings.OTP_TTL_SECONDS)
    await store.delete(f"otp_attempts:{email}")
    return code


async def verify_otp(email: str, code: str) -> bool:
    email = email.lower()
    store = get_store()
    attempts = await store.incr(f"otp_attempts:{email}", ex=settings.OTP_TTL_SECONDS)
    if attempts > settings.OTP_MAX_ATTEMPTS:
        await store.delete(f"otp:{email}")
        return False
    stored = await store.get(f"otp:{email}")
    if not stored or not hmac.compare_digest(stored, _otp_digest(email, code)):
        return False
    await store.delete(f"otp:{email}", f"otp_attempts:{email}")
    return True
