from demoloop_core.db import dispatch_session, workspace_session
from demoloop_core.jobs import claim, finish
from demoloop_core.pipeline import advance, start_production
from demoloop_core.publication import publish
from sqlalchemy import text

CONFIG = {"app": {"url": "http://127.0.0.1:4173"}}
PENDING = {"status": "pending-agent-review", "passed": False, "technical": {"passed": True}}
ACCEPTED = {"status": "accepted", "passed": True, "technical": {"passed": True}}


async def _to_review(session, workspace):
    production = await start_production(session, workspace, {"id": "demo"}, CONFIG)
    return production


async def test_evaluation_hands_the_video_to_a_reviewer(seeded_workspaces):
    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        await _to_review(session, workspace)

    async with dispatch_session() as session:
        for kind in ("capture", "render"):
            job = await claim(session, [kind], 60)
            await finish(session, job.id, job.lease_token, {"passed": True, "artifacts": {"video": "k/v"}})
            await advance(session, job.id)

        evaluated = await claim(session, ["evaluate"], 60)
        await finish(session, evaluated.id, evaluated.lease_token,
                     {"passed": True, "artifacts": {}, "quality": PENDING})
        await advance(session, evaluated.id)

        review = await claim(session, ["review"], 60)

    assert review is not None
    assert review.payload["artifacts"]["video"] == "k/v"
    assert review.payload["quality"] == PENDING, "the reviewer must receive the report it finalises"


async def test_an_accepted_review_is_what_makes_a_video_publishable(seeded_workspaces):
    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        production = await _to_review(session, workspace)

    async with dispatch_session() as session:
        for kind in ("capture", "render"):
            job = await claim(session, [kind], 60)
            await finish(session, job.id, job.lease_token, {"passed": True, "artifacts": {"video": "k/v"}})
            await advance(session, job.id)
        evaluated = await claim(session, ["evaluate"], 60)
        await finish(session, evaluated.id, evaluated.lease_token,
                     {"passed": True, "artifacts": {}, "quality": PENDING})
        await advance(session, evaluated.id)
        review = await claim(session, ["review"], 60)
        await finish(session, review.id, review.lease_token,
                     {"passed": True, "artifacts": {}, "quality": ACCEPTED})
        await advance(session, review.id)

    async with workspace_session(workspace) as session:
        row = (await session.execute(
            text("SELECT status, quality FROM production WHERE id = :id"), {"id": production}
        )).mappings().one()
        await publish(session, production)
        published = (await session.execute(
            text("SELECT published_at FROM production WHERE id = :id"), {"id": production}
        )).scalar_one()

    assert row["status"] == "complete"
    assert row["quality"]["status"] == "accepted"
    assert published is not None
