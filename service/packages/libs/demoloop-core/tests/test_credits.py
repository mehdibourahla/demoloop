from decimal import Decimal

from demoloop_core.credits import available, grant, reserve, settle
from demoloop_core.db import dispatch_session, workspace_session
from demoloop_core.jobs import claim, enqueue
from sqlalchemy import text


async def test_a_workspace_can_only_reserve_what_it_has(seeded_workspaces):
    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        await grant(session, workspace, Decimal("10"))

        assert await reserve(session, workspace, Decimal("6")) is True
        assert await reserve(session, workspace, Decimal("6")) is False
        assert await available(session, workspace) == Decimal("4")


async def test_settling_replaces_the_reservation_with_the_actual_cost(seeded_workspaces):
    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        await grant(session, workspace, Decimal("10"))
        await reserve(session, workspace, Decimal("6"))

        await settle(session, workspace, reserved=Decimal("6"), actual=Decimal("2"))

        assert await available(session, workspace) == Decimal("8")


async def test_an_exhausted_workspace_cannot_lease_the_job_it_queued(seeded_workspaces):
    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        await grant(session, workspace, Decimal("1"))
        await enqueue(session, workspace, "capture", {"estimated_credits": 5})

    async with dispatch_session() as session:
        refused = await claim(session, ["capture"], 60)

    assert refused is None


async def test_a_funded_workspace_leases_and_holds_the_estimate(seeded_workspaces):
    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        await grant(session, workspace, Decimal("10"))
        await enqueue(session, workspace, "capture", {"estimated_credits": 5})

    async with dispatch_session() as session:
        leased = await claim(session, ["capture"], 60)

    async with workspace_session(workspace) as session:
        assert leased is not None
        assert await available(session, workspace) == Decimal("5")


async def test_finishing_charges_what_the_work_actually_cost(seeded_workspaces):
    from demoloop_core.jobs import finish

    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        await grant(session, workspace, Decimal("10"))
        await enqueue(session, workspace, "capture", {"estimated_credits": 5})

    async with dispatch_session() as session:
        job = await claim(session, ["capture"], 60)
        await finish(session, job.id, job.lease_token, {"passed": True, "credits": 2})

    async with workspace_session(workspace) as session:
        assert await available(session, workspace) == Decimal("8")


async def test_a_run_whose_workspace_is_revoked_is_told_to_stop(seeded_workspaces):
    from demoloop_core.jobs import beat

    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        await grant(session, workspace, Decimal("10"))
        await enqueue(session, workspace, "capture", {"estimated_credits": 5})

    async with dispatch_session() as session:
        job = await claim(session, ["capture"], 60)
        assert await beat(session, job.id, job.lease_token) is True

        await session.execute(
            text("UPDATE credit_balance SET granted = 0 WHERE workspace_id = :w"), {"w": workspace}
        )

        assert await beat(session, job.id, job.lease_token) is False


async def test_a_production_carries_its_estimate_into_every_stage(seeded_workspaces):
    from demoloop_core.jobs import finish
    from demoloop_core.pipeline import advance, start_production

    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        await grant(session, workspace, Decimal("10"))
        await start_production(
            session, workspace, {"id": "demo"}, {"app": {"url": "http://x"}}, estimated_credits=3
        )

    async with dispatch_session() as session:
        capture = await claim(session, ["capture"], 60)
        await finish(session, capture.id, capture.lease_token, {"passed": True, "artifacts": {}})
        await advance(session, capture.id)
        render = await claim(session, ["render"], 60)

    assert capture.payload["estimated_credits"] == 3
    assert render.payload["estimated_credits"] == 3
