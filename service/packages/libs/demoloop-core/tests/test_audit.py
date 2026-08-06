import uuid

import pytest
from demoloop_core.audit import record, timeline
from demoloop_core.db import workspace_session
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError


async def test_an_event_names_who_did_what_to_which_thing(seeded_workspaces):
    workspace, _ = seeded_workspaces
    subject = uuid.uuid4()

    async with workspace_session(workspace) as session:
        await record(session, workspace, "ada", "published", "production", subject, {"title": "Deliver"})
        events = await timeline(session)

    assert len(events) == 1
    assert events[0]["actor"] == "ada"
    assert events[0]["action"] == "published"
    assert events[0]["detail"]["title"] == "Deliver"


async def test_history_cannot_be_rewritten(seeded_workspaces):
    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        await record(session, workspace, "ada", "published", "production", uuid.uuid4(), {})

    with pytest.raises(ProgrammingError, match="permission denied"):
        async with workspace_session(workspace) as session:
            await session.execute(text("UPDATE audit_event SET actor = 'someone-else'"))


async def test_history_cannot_be_erased(seeded_workspaces):
    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        await record(session, workspace, "ada", "published", "production", uuid.uuid4(), {})

    with pytest.raises(ProgrammingError, match="permission denied"):
        async with workspace_session(workspace) as session:
            await session.execute(text("DELETE FROM audit_event"))


async def test_another_workspace_cannot_read_this_history(seeded_workspaces):
    workspace, other = seeded_workspaces
    async with workspace_session(workspace) as session:
        await record(session, workspace, "ada", "published", "production", uuid.uuid4(), {})

    async with workspace_session(other) as session:
        assert await timeline(session) == []
