import json
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from demoloop_core.jobs import enqueue

NEXT_STAGE = {"capture": "render", "render": "evaluate", "evaluate": None}
STATUS_FOR = {"render": "rendering", "evaluate": "evaluating"}


async def start_production(session: AsyncSession, workspace_id: uuid.UUID, scenario: dict, config: dict) -> uuid.UUID:
    production_id = uuid.uuid4()
    await session.execute(
        text("""
            INSERT INTO production (id, workspace_id, scenario, config, status)
            VALUES (:id, :workspace, CAST(:scenario AS JSONB), CAST(:config AS JSONB), 'capturing')
        """),
        {
            "id": production_id, "workspace": workspace_id,
            "scenario": json.dumps(scenario), "config": json.dumps(config),
        },
    )
    job = await enqueue(session, workspace_id, "capture", {
        "production_id": str(production_id), "scenario": scenario, "config": config, "device": "desktop"
    })
    await session.execute(
        text("UPDATE job SET production_id = :production WHERE id = :id"),
        {"production": production_id, "id": job.id},
    )
    return production_id


async def _set_status(session: AsyncSession, production_id: uuid.UUID, status: str) -> None:
    await session.execute(
        text("UPDATE production SET status = :status WHERE id = :id"),
        {"status": status, "id": production_id},
    )


async def advance(session: AsyncSession, job_id: uuid.UUID) -> uuid.UUID | None:
    row = (await session.execute(
        text("SELECT workspace_id, kind, result, production_id, payload FROM job WHERE id = :id"), {"id": job_id}
    )).mappings().one()
    production_id = row["production_id"]
    if production_id is None:
        return None

    result = row["result"] if isinstance(row["result"], dict) else json.loads(row["result"] or "{}")
    if not result.get("passed", False):
        await _set_status(session, production_id, "failed")
        return None

    stage = NEXT_STAGE.get(row["kind"])
    if stage is None:
        if result.get("video"):
            await session.execute(
                text("UPDATE production SET video_key = :video WHERE id = :id"),
                {"video": result["video"], "id": production_id},
            )
        await _set_status(session, production_id, "complete")
        return None

    payload = row["payload"] if isinstance(row["payload"], dict) else json.loads(row["payload"])
    follow_on = await enqueue(session, row["workspace_id"], stage, {
        "production_id": str(production_id),
        "scenario": payload["scenario"],
        "config": payload["config"],
        "device": payload.get("device", "desktop"),
        "artifacts": result.get("artifacts", {}),
        "video": result.get("video"),
    })
    await session.execute(
        text("UPDATE job SET production_id = :production WHERE id = :id"),
        {"production": production_id, "id": follow_on.id},
    )
    await _set_status(session, production_id, STATUS_FOR[stage])
    return follow_on.id
