"""User creation + super-admin bootstrap."""
from __future__ import annotations

import logging

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.models import Role, User

logger = logging.getLogger(__name__)


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    return (await session.exec(select(User).where(User.email == email.lower()))).first()


async def create_user(session: AsyncSession, *, email: str, password: str, full_name: str,
                      role: Role = Role.executive, verified: bool = False) -> User:
    user = User(email=email.lower(), hashed_password=await hash_password(password), full_name=full_name,
                role=role, is_verified=verified, is_active=True)
    session.add(user)
    await session.flush()
    return user


async def ensure_super_admin(session: AsyncSession) -> None:
    exists = (await session.exec(select(User).where(User.role == Role.super_admin))).first()
    if exists:
        return
    if not settings.SUPERADMIN_EMAIL or not settings.SUPERADMIN_INIT_PASSWORD:
        logger.warning("No super_admin exists and SUPERADMIN_EMAIL/SUPERADMIN_INIT_PASSWORD are not set")
        return
    await create_user(session, email=settings.SUPERADMIN_EMAIL, password=settings.SUPERADMIN_INIT_PASSWORD,
                      full_name=settings.SUPERADMIN_FULL_NAME, role=Role.super_admin, verified=True)
    await session.commit()
    logger.info("Seeded initial super_admin account")
