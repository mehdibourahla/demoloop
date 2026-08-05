from demoloop_core.db import dispatch_session, workspace_session
from demoloop_core.jobs import beat, claim, enqueue, finish


async def test_two_workers_never_claim_the_same_job(seeded_workspaces):
    first, _ = seeded_workspaces
    async with workspace_session(first) as session:
        await enqueue(session, first, "capture", {"scenario": "demo"})

    async with dispatch_session() as one, dispatch_session() as two:
        claimed = await claim(one, ["capture"], lease_seconds=60)
        contended = await claim(two, ["capture"], lease_seconds=60)

    assert claimed is not None
    assert contended is None


async def test_an_expired_lease_returns_the_job_to_the_queue(seeded_workspaces):
    first, _ = seeded_workspaces
    async with workspace_session(first) as session:
        await enqueue(session, first, "capture", {"scenario": "demo"})

    async with dispatch_session() as session:
        first_claim = await claim(session, ["capture"], lease_seconds=-1)
    async with dispatch_session() as session:
        reclaimed = await claim(session, ["capture"], lease_seconds=60)

    assert reclaimed is not None
    assert reclaimed.id == first_claim.id
    assert reclaimed.attempt == first_claim.attempt + 1


async def test_a_stale_lease_token_cannot_finish_the_job(seeded_workspaces):
    first, _ = seeded_workspaces
    async with workspace_session(first) as session:
        await enqueue(session, first, "capture", {"scenario": "demo"})

    async with dispatch_session() as session:
        job = await claim(session, ["capture"], lease_seconds=60)

        assert await finish(session, job.id, "00000000-0000-0000-0000-000000000000", {"passed": True}) is False
        assert await finish(session, job.id, job.lease_token, {"passed": True}) is True
        assert await beat(session, job.id, job.lease_token) is False


async def test_the_dispatch_role_is_refused_tenant_tables_outright(seeded_workspaces):
    import pytest
    from sqlalchemy import select
    from sqlalchemy.exc import ProgrammingError

    from demoloop_core.models import Product

    with pytest.raises(ProgrammingError, match="permission denied for table product"):
        async with dispatch_session() as session:
            await session.scalars(select(Product))
