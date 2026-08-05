import uuid

import pytest_asyncio
from sqlalchemy import text

from demoloop_core.db import admin_engine, workspace_session
from demoloop_core.models import Product


@pytest_asyncio.fixture
async def seeded_workspaces():
    first, second = uuid.uuid4(), uuid.uuid4()
    async with admin_engine().begin() as connection:
        await connection.execute(text("TRUNCATE workspace CASCADE"))
        for identifier in (first, second):
            await connection.execute(
                text("INSERT INTO workspace (id, name) VALUES (:id, :name)"),
                {"id": identifier, "name": str(identifier)},
            )
    for identifier in (first, second):
        async with workspace_session(identifier) as session:
            session.add(Product(workspace_id=identifier, name="App"))
    return first, second
