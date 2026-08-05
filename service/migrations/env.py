import asyncio

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from demoloop_core.models import Base
from demoloop_core.settings import settings

target_metadata = Base.metadata


def do_run(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run() -> None:
    engine = create_async_engine(settings().admin_database_url)
    async with engine.begin() as connection:
        await connection.run_sync(do_run)
    await engine.dispose()


asyncio.run(run())
