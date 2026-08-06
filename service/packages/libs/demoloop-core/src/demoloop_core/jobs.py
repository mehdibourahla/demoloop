import json
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from demoloop_core.models import Job

# A job is only leasable while its workspace can still pay the estimate, so a
# ceiling refuses the work rather than billing for work it meant to refuse.
CLAIM = text("""
    UPDATE job SET
        status = 'leased',
        lease_token = gen_random_uuid(),
        leased_until = now() + make_interval(secs => :lease_seconds),
        attempt = attempt + 1,
        reserved_credits = COALESCE((payload->>'estimated_credits')::numeric, 0)
    WHERE id = (
        SELECT job.id FROM job
        LEFT JOIN credit_balance ON credit_balance.workspace_id = job.workspace_id
        WHERE job.kind = ANY(:kinds)
          AND job.status IN ('queued', 'leased')
          AND (job.leased_until IS NULL OR job.leased_until < now())
          AND COALESCE((job.payload->>'estimated_credits')::numeric, 0)
              <= COALESCE(credit_balance.granted - credit_balance.spent - credit_balance.reserved, 0)
        ORDER BY job.created_at
        FOR UPDATE OF job SKIP LOCKED
        LIMIT 1
    )
    RETURNING id, workspace_id, kind, status, payload, lease_token, leased_until, attempt, reserved_credits
""")


async def enqueue(session: AsyncSession, workspace_id: uuid.UUID, kind: str, payload: dict) -> Job:
    job = Job(workspace_id=workspace_id, kind=kind, payload=payload)
    session.add(job)
    await session.flush()
    return job


async def claim(session: AsyncSession, kinds: list[str], lease_seconds: int) -> Job | None:
    row = (await session.execute(CLAIM, {"kinds": kinds, "lease_seconds": lease_seconds})).mappings().one_or_none()
    if row is None:
        return None
    if row["reserved_credits"]:
        await session.execute(
            text("UPDATE credit_balance SET reserved = reserved + :amount WHERE workspace_id = :workspace"),
            {"amount": row["reserved_credits"], "workspace": row["workspace_id"]},
        )
    return Job(**{key: value for key, value in row.items() if key != "reserved_credits"})


async def beat(session: AsyncSession, job_id: uuid.UUID, lease_token: uuid.UUID | str, lease_seconds: int = 60) -> bool:
    result = await session.execute(
        text("""
            UPDATE job SET leased_until = now() + make_interval(secs => :lease_seconds)
            WHERE id = :id AND lease_token = CAST(:token AS uuid) AND status = 'leased'
              AND NOT EXISTS (
                  SELECT 1 FROM credit_balance
                  WHERE credit_balance.workspace_id = job.workspace_id
                    AND credit_balance.granted - credit_balance.spent - credit_balance.reserved < 0
              )
        """),
        {"id": job_id, "token": str(lease_token), "lease_seconds": lease_seconds},
    )
    return result.rowcount == 1


async def finish(session: AsyncSession, job_id: uuid.UUID, lease_token: uuid.UUID | str, result: dict) -> bool:
    held = (await session.execute(
        text("SELECT workspace_id, reserved_credits FROM job WHERE id = :id AND lease_token = CAST(:token AS uuid)"),
        {"id": job_id, "token": str(lease_token)},
    )).mappings().one_or_none()
    outcome = await session.execute(
        text("""
            UPDATE job SET status = 'done', result = CAST(:result AS JSONB), leased_until = NULL
            WHERE id = :id AND lease_token = CAST(:token AS uuid) AND status = 'leased'
        """),
        {"id": job_id, "token": str(lease_token), "result": json.dumps(result)},
    )
    if outcome.rowcount == 1 and held and held["reserved_credits"]:
        await session.execute(
            text("""
                UPDATE credit_balance
                SET reserved = GREATEST(reserved - :reserved, 0), spent = spent + :actual
                WHERE workspace_id = :workspace
            """),
            {
                "reserved": held["reserved_credits"],
                "actual": result.get("credits", held["reserved_credits"]),
                "workspace": held["workspace_id"],
            },
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
