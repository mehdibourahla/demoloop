import uuid

from demoloop_core.db import workspace_session
from demoloop_core.pipeline import start_production, start_reconnaissance, start_verification
from demoloop_core.storage import presign_get
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from demoloop_api.identity import Caller, caller

router = APIRouter(prefix="/v1", tags=["studio"])


class ReconnaissanceRequest(BaseModel):
    config: dict


class ProductionRequest(BaseModel):
    scenario: dict
    config: dict


async def _row(who: Caller, table: str, identifier: uuid.UUID, columns: str) -> dict:
    async with workspace_session(who.workspace_id) as session:
        row = (await session.execute(
            text(f"SELECT {columns} FROM {table} WHERE id = :id"), {"id": identifier}
        )).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"{table} not found")
    return dict(row)


@router.post("/reconnaissance", status_code=201)
async def begin_reconnaissance(request: ReconnaissanceRequest, who: Caller = Depends(caller)) -> dict:
    async with workspace_session(who.workspace_id) as session:
        recon = await start_reconnaissance(session, who.workspace_id, request.config)
    return {"id": str(recon), "status": "discovering"}


@router.get("/reconnaissance/{recon_id}")
async def read_reconnaissance(recon_id: uuid.UUID, who: Caller = Depends(caller)) -> dict:
    row = await _row(who, "reconnaissance", recon_id, "id, status, model, plan")
    return {"id": str(row["id"]), "status": row["status"], "model": row["model"], "plan": row["plan"]}


@router.post("/productions", status_code=201)
async def begin_production(request: ProductionRequest, who: Caller = Depends(caller)) -> dict:
    async with workspace_session(who.workspace_id) as session:
        production = await start_production(session, who.workspace_id, request.scenario, request.config)
    return {"id": str(production), "status": "capturing"}


@router.get("/productions/{production_id}")
async def read_production(production_id: uuid.UUID, who: Caller = Depends(caller)) -> dict:
    row = await _row(who, "production", production_id, "id, status, video_key")
    return {
        "id": str(row["id"]),
        "status": row["status"],
        "video": presign_get(row["video_key"]) if row["video_key"] else None,
    }


@router.post("/productions/{production_id}/verifications", status_code=201)
async def begin_verification(production_id: uuid.UUID, who: Caller = Depends(caller)) -> dict:
    await _row(who, "production", production_id, "id")
    async with workspace_session(who.workspace_id) as session:
        check = await start_verification(session, who.workspace_id, production_id)
    return {"id": str(check), "status": "checking"}


@router.get("/verifications/{verification_id}")
async def read_verification(verification_id: uuid.UUID, who: Caller = Depends(caller)) -> dict:
    row = await _row(who, "verification", verification_id, "id, status, drifted, checked_at")
    return {
        "id": str(row["id"]),
        "status": row["status"],
        "drifted": row["drifted"],
        "checkedAt": row["checked_at"].isoformat() if row["checked_at"] else None,
    }
