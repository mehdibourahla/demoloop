import pytest
from demoloop_core.db import workspace_session
from demoloop_core.publication import PublicationRefused, publish
from sqlalchemy import text

CONFIG = {"app": {"url": "http://127.0.0.1:4173"}}


async def _production(session, workspace, quality):
    from demoloop_core.pipeline import start_production

    production = await start_production(session, workspace, {"id": "demo"}, CONFIG)
    await session.execute(
        text("""
            UPDATE production SET status = 'complete', video_key = 'k/v', quality = CAST(:q AS JSONB)
            WHERE id = :id
        """),
        {"q": quality, "id": production},
    )
    return production


async def test_a_video_no_agent_watched_cannot_be_published(seeded_workspaces):
    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        production = await _production(session, workspace, '{"status": "pending-agent-review", "passed": false}')

        with pytest.raises(PublicationRefused, match="not been reviewed"):
            await publish(session, production)


async def test_a_rejected_video_cannot_be_published(seeded_workspaces):
    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        production = await _production(session, workspace, '{"status": "rejected", "passed": false}')

        with pytest.raises(PublicationRefused, match="rejected"):
            await publish(session, production)


async def test_an_accepted_video_publishes(seeded_workspaces):
    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        production = await _production(session, workspace, '{"status": "accepted", "passed": true}')

        await publish(session, production)

        published = (await session.execute(
            text("SELECT published_at FROM production WHERE id = :id"), {"id": production}
        )).scalar_one()

    assert published is not None


async def test_a_production_still_running_cannot_be_published(seeded_workspaces):
    workspace, _ = seeded_workspaces
    from demoloop_core.pipeline import start_production

    async with workspace_session(workspace) as session:
        production = await start_production(session, workspace, {"id": "demo"}, CONFIG)

        with pytest.raises(PublicationRefused, match="not complete"):
            await publish(session, production)
