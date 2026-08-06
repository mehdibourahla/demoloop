import uuid
from datetime import datetime, timedelta, timezone

from demoloop_core.db import admin_engine, workspace_session
from demoloop_core.retention import PLANS, expired_artifacts, retention_days
from sqlalchemy import text


async def _production(workspace, age_days: int, published: bool = False) -> uuid.UUID:
    production = uuid.uuid4()
    created = datetime.now(timezone.utc) - timedelta(days=age_days)
    async with admin_engine().begin() as connection:
        await connection.execute(
            text("""
                INSERT INTO production (id, workspace_id, scenario, config, status, video_key, created_at, published_at)
                VALUES (:id, :w, '{}'::jsonb, '{}'::jsonb, 'complete', 'k/v', :created, :published)
            """),
            {"id": production, "w": workspace, "created": created,
             "published": created if published else None},
        )
    return production


def test_every_plan_names_a_retention_window():
    assert set(PLANS) == {"free", "pro", "team", "enterprise"}
    assert retention_days("free") == 30
    assert retention_days("pro") < retention_days("team")


def test_an_unknown_plan_falls_back_to_the_shortest_window():
    assert retention_days("invented") == retention_days("free")


async def test_recordings_past_the_window_are_listed_for_removal(seeded_workspaces):
    workspace, _ = seeded_workspaces
    old = await _production(workspace, age_days=90)
    await _production(workspace, age_days=5)

    async with workspace_session(workspace) as session:
        expired = await expired_artifacts(session, plan="free")

    assert [entry["id"] for entry in expired] == [old]


async def test_a_published_demo_is_never_swept(seeded_workspaces):
    workspace, _ = seeded_workspaces
    await _production(workspace, age_days=900, published=True)

    async with workspace_session(workspace) as session:
        assert await expired_artifacts(session, plan="free") == []


async def test_sweeping_deletes_the_objects_and_forgets_the_key(seeded_workspaces):
    from demoloop_core.retention import sweep

    workspace, _ = seeded_workspaces
    production = await _production(workspace, age_days=90)
    deleted: list[str] = []

    async with workspace_session(workspace) as session:
        swept = await sweep(session, plan="free", remove=lambda key: deleted.append(key))
        remaining = (await session.execute(
            text("SELECT video_key FROM production WHERE id = :id"), {"id": production}
        )).scalar_one()

    assert swept == 1
    assert deleted == ["k/v"]
    assert remaining is None


async def test_a_sweep_that_cannot_delete_leaves_the_record_pointing_at_the_object(seeded_workspaces):
    from demoloop_core.retention import sweep

    workspace, _ = seeded_workspaces
    production = await _production(workspace, age_days=90)

    def refuse(_key):
        raise RuntimeError("storage unavailable")

    async with workspace_session(workspace) as session:
        swept = await sweep(session, plan="free", remove=refuse)
        remaining = (await session.execute(
            text("SELECT video_key FROM production WHERE id = :id"), {"id": production}
        )).scalar_one()

    assert swept == 0
    assert remaining == "k/v", "forgetting the key while the object survives would orphan it forever"
