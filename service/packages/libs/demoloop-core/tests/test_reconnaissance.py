from demoloop_core.db import dispatch_session, workspace_session
from demoloop_core.jobs import claim, finish
from demoloop_core.pipeline import advance, start_reconnaissance
from sqlalchemy import text

MODEL = {"version": 2, "product": "Fixture", "proofSurfaces": []}


async def test_reconnaissance_discovers_then_plans(seeded_workspaces):
    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        recon = await start_reconnaissance(session, workspace, {"app": {"url": "http://127.0.0.1:4173"}})

    async with dispatch_session() as session:
        found = await claim(session, ["discover"], 60)
        await finish(session, found.id, found.lease_token, {"passed": True, "model": MODEL, "artifacts": {}})
        await advance(session, found.id)

        planned = await claim(session, ["plan"], 60)
        assert planned is not None
        assert planned.payload["model"] == MODEL

        await finish(session, planned.id, planned.lease_token, {"passed": True, "plan": {"status": "planned"}})
        await advance(session, planned.id)

        row = (await session.execute(
            text("SELECT status, model, plan FROM reconnaissance WHERE id = :id"), {"id": recon}
        )).mappings().one()

    assert row["status"] == "complete"
    assert row["model"] == MODEL
    assert row["plan"] == {"status": "planned"}


async def test_a_model_that_cannot_be_planned_stops_reconnaissance(seeded_workspaces):
    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        recon = await start_reconnaissance(session, workspace, {"app": {"url": "http://127.0.0.1:4173"}})

    async with dispatch_session() as session:
        found = await claim(session, ["discover"], 60)
        await finish(session, found.id, found.lease_token, {"passed": True, "model": MODEL, "artifacts": {}})
        await advance(session, found.id)
        planned = await claim(session, ["plan"], 60)
        await finish(session, planned.id, planned.lease_token,
                     {"passed": False, "plan": {"status": "needs-authoring"}})
        await advance(session, planned.id)

        status = (await session.execute(
            text("SELECT status FROM reconnaissance WHERE id = :id"), {"id": recon}
        )).scalar_one()

    assert status == "needs-authoring"
