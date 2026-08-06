import uuid

from demoloop_core.db import dispatch_session, workspace_session
from demoloop_core.jobs import claim, finish
from demoloop_core.pipeline import advance, start_production
from sqlalchemy import text


async def production_status(production_id: uuid.UUID) -> str:
    async with dispatch_session() as session:
        return (await session.execute(
            text("SELECT status FROM production WHERE id = :id"), {"id": production_id}
        )).scalar_one()


async def test_a_production_starts_by_queueing_capture(seeded_workspaces):
    workspace, _ = seeded_workspaces

    async with workspace_session(workspace) as session:
        production = await start_production(session, workspace, {"id": "demo"}, {"app": {"url": "http://127.0.0.1:4173"}})

    async with dispatch_session() as session:
        job = await claim(session, ["capture", "render", "evaluate"], 60)

    assert job.kind == "capture"
    assert job.payload["production_id"] == str(production)


async def test_a_finished_capture_queues_render_with_its_artifacts(seeded_workspaces):
    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        production = await start_production(session, workspace, {"id": "demo"}, {"app": {"url": "http://127.0.0.1:4173"}})

    async with dispatch_session() as session:
        capture = await claim(session, ["capture"], 60)
        await finish(session, capture.id, capture.lease_token, {"passed": True, "artifacts": {"raw-a": "key/raw-a"}})
        await advance(session, capture.id)
        nxt = await claim(session, ["render"], 60)

    assert nxt is not None
    assert nxt.payload["artifacts"] == {"raw-a": "key/raw-a"}
    assert nxt.payload["production_id"] == str(production)
    assert await production_status(production) == "rendering"


async def test_a_failed_capture_stops_the_production(seeded_workspaces):
    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        production = await start_production(session, workspace, {"id": "demo"}, {"app": {"url": "http://127.0.0.1:4173"}})

    async with dispatch_session() as session:
        capture = await claim(session, ["capture"], 60)
        await finish(session, capture.id, capture.lease_token, {"passed": False})
        await advance(session, capture.id)
        nxt = await claim(session, ["render"], 60)

    assert nxt is None
    assert await production_status(production) == "failed"


async def test_the_pipeline_runs_capture_render_evaluate_then_review(seeded_workspaces):
    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        production = await start_production(session, workspace, {"id": "demo"}, {"app": {"url": "http://127.0.0.1:4173"}})

    kinds = []
    async with dispatch_session() as session:
        for _ in range(4):
            job = await claim(session, ["capture", "render", "evaluate", "review"], 60)
            if job is None:
                break
            kinds.append(job.kind)
            await finish(session, job.id, job.lease_token, {"passed": True, "artifacts": {}, "video": "key/video.mp4"})
            await advance(session, job.id)

    assert kinds == ["capture", "render", "evaluate", "review"]
    assert await production_status(production) == "complete"
