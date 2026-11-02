"""Async SQLModel engine/session management."""
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings

_engine_kwargs: dict = {"pool_pre_ping": True}
if not settings.is_sqlite:
    # Free-tier Postgres plans allow very few connections: keep the pool tiny.
    _engine_kwargs.update(
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_recycle=1800,
        connect_args=settings.db_connect_args,
    )

engine = create_async_engine(settings.async_database_url, **_engine_kwargs)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with async_session_factory() as session:
        yield session


async def create_all_tables() -> None:
    import app.models  # noqa: F401  (register tables)

    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
