import json
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from demoloop_core.models import Job

CLAIM = text("""
    UPDATE job SET
        status = 'leased',
        lease_token = gen_random_uuid(),
        leased_until = now() + make_interval(secs => :lease_seconds),
        attempt = attempt + 1
    WHERE id = (
        SELECT id FROM job
        WHERE kind = ANY(:kinds)
          AND status IN ('queued', 'leased')
          AND (leased_until IS NULL OR leased_until < now())
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING id, workspace_id, kind, status, payload, lease_token, leased_until, attempt
""")


async def enqueue(session: AsyncSession, workspace_id: uuid.UUID, kind: str, payload: dict) -> Job:
    job = Job(workspace_id=workspace_id, kind=kind, payload=payload)
    session.add(job)
    await session.flush()
    return job


async def claim(session: AsyncSession, kinds: list[str], lease_seconds: int) -> Job | None:
    row = (await session.execute(CLAIM, {"kinds": kinds, "lease_seconds": lease_seconds})).mappings().one_or_none()
    return Job(**row) if row else None


async def beat(session: AsyncSession, job_id: uuid.UUID, lease_token: uuid.UUID | str, lease_seconds: int = 60) -> bool:
    result = await session.execute(
        text("""
            UPDATE job SET leased_until = now() + make_interval(secs => :lease_seconds)
            WHERE id = :id AND lease_token = CAST(:token AS uuid) AND status = 'leased'
        """),
        {"id": job_id, "token": str(lease_token), "lease_seconds": lease_seconds},
    )
    return result.rowcount == 1


async def finish(session: AsyncSession, job_id: uuid.UUID, lease_token: uuid.UUID | str, result: dict) -> bool:
    outcome = await session.execute(
        text("""
            UPDATE job SET status = 'done', result = CAST(:result AS JSONB), leased_until = NULL
            WHERE id = :id AND lease_token = CAST(:token AS uuid) AND status = 'leased'
        """),
        {"id": job_id, "token": str(lease_token), "result": json.dumps(result)},
    )
    return outcome.rowcount == 1


async def leased_job(session: AsyncSession, job_id: uuid.UUID, lease_token: uuid.UUID | str) -> dict | None:
    row = (await session.execute(
        text("""
            SELECT id, workspace_id FROM job
            WHERE id = :id AND lease_token = CAST(:token AS uuid) AND status = 'leased'
        """),
        {"id": job_id, "token": str(lease_token)},
    )).mappings().one_or_none()
    return dict(row) if row else None
