import json
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from demoloop_core.jobs import enqueue

NEXT_STAGE = {"capture": "render", "render": "evaluate", "evaluate": None, "discover": "plan", "plan": None}
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


async def start_reconnaissance(session: AsyncSession, workspace_id: uuid.UUID, config: dict) -> uuid.UUID:
    recon_id = uuid.uuid4()
    await session.execute(
        text("""
            INSERT INTO reconnaissance (id, workspace_id, config, status)
            VALUES (:id, :workspace, CAST(:config AS JSONB), 'discovering')
        """),
        {"id": recon_id, "workspace": workspace_id, "config": json.dumps(config)},
    )
    job = await enqueue(session, workspace_id, "discover", {"reconnaissance_id": str(recon_id), "config": config})
    await session.execute(
        text("UPDATE job SET reconnaissance_id = :recon WHERE id = :id"),
        {"recon": recon_id, "id": job.id},
    )
    return recon_id


async def _advance_reconnaissance(session: AsyncSession, recon_id: uuid.UUID, row: dict, result: dict) -> None:
    payload = row["payload"] if isinstance(row["payload"], dict) else json.loads(row["payload"])
    if row["kind"] == "discover":
        if not result.get("passed", False):
            await _set_recon_status(session, recon_id, "failed")
            return
        await session.execute(
            text("UPDATE reconnaissance SET model = CAST(:model AS JSONB) WHERE id = :id"),
            {"model": json.dumps(result.get("model")), "id": recon_id},
        )
        follow_on = await enqueue(session, row["workspace_id"], "plan", {
            "reconnaissance_id": str(recon_id),
            "config": payload["config"],
            "model": result.get("model"),
            "mode": payload.get("mode", "full"),
        })
        await session.execute(
            text("UPDATE job SET reconnaissance_id = :recon WHERE id = :id"),
            {"recon": recon_id, "id": follow_on.id},
        )
        await _set_recon_status(session, recon_id, "planning")
        return

    await session.execute(
        text("UPDATE reconnaissance SET plan = CAST(:plan AS JSONB) WHERE id = :id"),
        {"plan": json.dumps(result.get("plan")), "id": recon_id},
    )
    await _set_recon_status(
        session, recon_id, "complete" if result.get("passed", False) else "needs-authoring"
    )


async def _set_recon_status(session: AsyncSession, recon_id: uuid.UUID, status: str) -> None:
    await session.execute(
        text("UPDATE reconnaissance SET status = :status WHERE id = :id"),
        {"status": status, "id": recon_id},
    )


async def _set_status(session: AsyncSession, production_id: uuid.UUID, status: str) -> None:
    await session.execute(
        text("UPDATE production SET status = :status WHERE id = :id"),
        {"status": status, "id": production_id},
    )


async def advance(session: AsyncSession, job_id: uuid.UUID) -> uuid.UUID | None:
    row = (await session.execute(
        text("""
            SELECT workspace_id, kind, result, production_id, reconnaissance_id, payload
            FROM job WHERE id = :id
        """),
        {"id": job_id},
    )).mappings().one()
    result = row["result"] if isinstance(row["result"], dict) else json.loads(row["result"] or "{}")

    if row["reconnaissance_id"] is not None:
        await _advance_reconnaissance(session, row["reconnaissance_id"], dict(row), result)
        return None

    production_id = row["production_id"]
    if production_id is None:
        return None
    if not result.get("passed", False):
        await _set_status(session, production_id, "failed")
        return None

    payload_now = row["payload"] if isinstance(row["payload"], dict) else json.loads(row["payload"])
    artifacts = {**payload_now.get("artifacts", {}), **result.get("artifacts", {})}
    if artifacts.get("video"):
        await session.execute(
            text("UPDATE production SET video_key = :video WHERE id = :id"),
            {"video": artifacts["video"], "id": production_id},
        )

    stage = NEXT_STAGE.get(row["kind"])
    if stage is None:
        await _set_status(session, production_id, "complete")
        return None

    follow_on = await enqueue(session, row["workspace_id"], stage, {
        "production_id": str(production_id),
        "scenario": payload_now["scenario"],
        "config": payload_now["config"],
        "device": payload_now.get("device", "desktop"),
        "artifacts": artifacts,
    })
    await session.execute(
        text("UPDATE job SET production_id = :production WHERE id = :id"),
        {"production": production_id, "id": follow_on.id},
    )
    await _set_status(session, production_id, STATUS_FOR[stage])
    return follow_on.id
