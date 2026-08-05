import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

from demoloop_core.settings import settings


@lru_cache
def engine() -> AsyncEngine:
    return create_async_engine(settings().database_url, pool_pre_ping=True)


@lru_cache
def admin_engine() -> AsyncEngine:
    return create_async_engine(settings().admin_database_url, pool_pre_ping=True)


@asynccontextmanager
async def workspace_session(workspace_id: uuid.UUID) -> AsyncIterator[AsyncSession]:
    async with AsyncSession(engine(), expire_on_commit=False) as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config('demoloop.workspace_id', :workspace, true)"),
                {"workspace": str(workspace_id)},
            )
            yield session


@asynccontextmanager
async def privileged_session() -> AsyncIterator[AsyncSession]:
    async with AsyncSession(engine(), expire_on_commit=False) as session:
        async with session.begin():
            yield session
