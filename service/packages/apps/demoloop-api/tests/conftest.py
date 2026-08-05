import uuid

import pytest_asyncio
from demoloop_core.db import admin_engine
from sqlalchemy import text


@pytest_asyncio.fixture
async def empty_queue():
    async with admin_engine().begin() as connection:
        await connection.execute(text("TRUNCATE workspace CASCADE"))


@pytest_asyncio.fixture
async def queued_capture_job(empty_queue):
    workspace = uuid.uuid4()
    async with admin_engine().begin() as connection:
        await connection.execute(
            text("INSERT INTO workspace (id, name) VALUES (:id, 'Fixture')"), {"id": workspace}
        )
        await connection.execute(
            text("INSERT INTO job (id, workspace_id, kind, payload) VALUES (:id, :workspace, 'capture', '{}')"),
            {"id": uuid.uuid4(), "workspace": workspace},
        )
    return workspace
