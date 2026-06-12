from collections.abc import AsyncGenerator

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

_engine = None
_session_factory = None


def _to_async_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


def get_engine():
    global _engine, _session_factory
    if _engine is None:
        if not settings.database_url:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="DATABASE_URL is not configured",
            )
        _engine = create_async_engine(
            _to_async_url(settings.database_url),
            echo=False,
            pool_pre_ping=True,
            pool_recycle=300,
        )
        _session_factory = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    get_engine()
    async with _session_factory() as session:
        yield session


def session_factory():
    get_engine()
    return _session_factory
