import uuid

from demoloop_core.db import workspace_session
from demoloop_core.models import Product
from sqlalchemy import select


async def test_a_workspace_cannot_read_another_workspaces_products(seeded_workspaces):
    first, second = seeded_workspaces

    async with workspace_session(first) as session:
        visible = (await session.scalars(select(Product))).all()

    assert [product.workspace_id for product in visible] == [first]
    assert second not in {product.workspace_id for product in visible}


async def test_an_unscoped_session_sees_nothing(seeded_workspaces):
    async with workspace_session(uuid.uuid4()) as session:
        assert (await session.scalars(select(Product))).all() == []
