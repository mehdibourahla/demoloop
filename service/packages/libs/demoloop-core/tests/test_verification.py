from demoloop_core.db import dispatch_session, workspace_session
from demoloop_core.jobs import claim, finish
from demoloop_core.pipeline import advance, start_production, start_verification
from sqlalchemy import text

SCENARIO = {"id": "demo", "scenes": []}
CONFIG = {"app": {"url": "http://127.0.0.1:4173"}}


async def _production(workspace):
    async with workspace_session(workspace) as session:
        return await start_production(session, workspace, SCENARIO, CONFIG)


async def test_an_unchanged_product_leaves_the_demo_fresh(seeded_workspaces):
    workspace, _ = seeded_workspaces
    production = await _production(workspace)
    async with workspace_session(workspace) as session:
        check = await start_verification(session, workspace, production)

    async with dispatch_session() as session:
        job = await claim(session, ["verify"], 60)
        await finish(session, job.id, job.lease_token, {"passed": True, "drifted": []})
        await advance(session, job.id)
        row = (await session.execute(
            text("SELECT status, drifted, checked_at FROM verification WHERE id = :id"), {"id": check}
        )).mappings().one()

    assert row["status"] == "fresh"
    assert row["drifted"] == []
    assert row["checked_at"] is not None


async def test_a_moved_element_marks_the_demo_drifted_with_what_moved(seeded_workspaces):
    workspace, _ = seeded_workspaces
    production = await _production(workspace)
    async with workspace_session(workspace) as session:
        check = await start_verification(session, workspace, production)

    moved = [{"sceneId": "create", "label": "Create record", "status": "missing", "matches": 0}]
    async with dispatch_session() as session:
        job = await claim(session, ["verify"], 60)
        await finish(session, job.id, job.lease_token, {"passed": False, "drifted": moved})
        await advance(session, job.id)
        row = (await session.execute(
            text("SELECT status, drifted FROM verification WHERE id = :id"), {"id": check}
        )).mappings().one()

    assert row["status"] == "drifted"
    assert row["drifted"] == moved


async def test_an_ambiguous_target_is_repairable_not_broken(seeded_workspaces):
    workspace, _ = seeded_workspaces
    production = await _production(workspace)
    async with workspace_session(workspace) as session:
        check = await start_verification(session, workspace, production)

    ambiguous = [{"sceneId": "create", "label": "Save", "status": "ambiguous", "matches": 2}]
    async with dispatch_session() as session:
        job = await claim(session, ["verify"], 60)
        await finish(session, job.id, job.lease_token, {"passed": False, "drifted": ambiguous})
        await advance(session, job.id)
        status = (await session.execute(
            text("SELECT status FROM verification WHERE id = :id"), {"id": check}
        )).scalar_one()

    assert status == "repairable"


async def test_verifying_does_not_disturb_the_production_it_checks(seeded_workspaces):
    workspace, _ = seeded_workspaces
    production = await _production(workspace)
    async with workspace_session(workspace) as session:
        await start_verification(session, workspace, production)

    async with dispatch_session() as session:
        job = await claim(session, ["verify"], 60)
        await finish(session, job.id, job.lease_token, {"passed": True, "drifted": []})
        await advance(session, job.id)
        status = (await session.execute(
            text("SELECT status FROM production WHERE id = :id"), {"id": production}
        )).scalar_one()

    assert status == "capturing"
