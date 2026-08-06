import uuid
from datetime import datetime, timezone

import pytest
from demoloop_core.db import admin_engine, workspace_session
from demoloop_core.sharing import SharingRefused, receipt_for, resolve, share
from sqlalchemy import text

ACCEPTED = '{"status": "accepted", "passed": true, "agentReview": {"score": 8.4}}'
PROVENANCE = '{"commit": "8f2c1a9", "appUrl": "https://staging.example.com", "dirty": false}'


async def _published(workspace, published=True, quality=ACCEPTED) -> uuid.UUID:
    production = uuid.uuid4()
    async with admin_engine().begin() as connection:
        await connection.execute(
            text("""
                INSERT INTO production
                    (id, workspace_id, scenario, config, status, video_key, quality, provenance, published_at)
                VALUES (:id, :w, CAST(:s AS JSONB), '{}'::jsonb, 'complete', 'k/v',
                        CAST(:q AS JSONB), CAST(:p AS JSONB), :pub)
            """),
            {
                "id": production, "w": workspace, "s": '{"title": "Deliver an item"}',
                "q": quality, "p": PROVENANCE,
                "pub": datetime(2026, 8, 4, 14, 3, tzinfo=timezone.utc) if published else None,
            },
        )
    return production


async def test_an_unpublished_demo_cannot_be_shared(seeded_workspaces):
    workspace, _ = seeded_workspaces
    production = await _published(workspace, published=False)

    async with workspace_session(workspace) as session:
        with pytest.raises(SharingRefused, match="not published"):
            await share(session, workspace, production)


async def test_a_published_demo_yields_an_unguessable_token(seeded_workspaces):
    workspace, _ = seeded_workspaces
    production = await _published(workspace)

    async with workspace_session(workspace) as session:
        first = await share(session, workspace, production)
        second = await share(session, workspace, production)

    assert len(first) >= 32
    assert first != second


async def test_a_token_resolves_to_the_receipt_the_prd_describes(seeded_workspaces):
    workspace, _ = seeded_workspaces
    production = await _published(workspace)

    async with workspace_session(workspace) as session:
        token = await share(session, workspace, production)

    found = await resolve(token)

    assert found is not None
    receipt = receipt_for(found)
    assert receipt["commit"] == "8f2c1a9"
    assert receipt["environment"] == "https://staging.example.com"
    assert receipt["agentScore"] == 8.4
    assert receipt["title"] == "Deliver an item"


async def test_a_revoked_link_stops_resolving(seeded_workspaces):
    workspace, _ = seeded_workspaces
    production = await _published(workspace)

    async with workspace_session(workspace) as session:
        token = await share(session, workspace, production)
        await session.execute(
            text("UPDATE share_link SET revoked_at = now() WHERE token = :t"), {"t": token}
        )

    assert await resolve(token) is None


async def test_an_unknown_token_resolves_to_nothing():
    assert await resolve("not-a-real-token") is None
