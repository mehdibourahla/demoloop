import uuid

from demoloop_core.audit import record, timeline
from demoloop_core.credits import estimate_credits
from demoloop_core.db import workspace_session
from demoloop_core.pipeline import start_production, start_reconnaissance, start_verification
from demoloop_core.publication import PublicationRefused, publish
from demoloop_core.sharing import SharingRefused, share
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
    estimated_credits: float | None = None


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


@router.get("/reconnaissance")
async def list_reconnaissance(who: Caller = Depends(caller)) -> dict:
    async with workspace_session(who.workspace_id) as session:
        rows = (await session.execute(
            text("SELECT id, status, model, created_at FROM reconnaissance ORDER BY created_at DESC")
        )).mappings().all()
    return {"reconnaissances": [_map_summary(row) for row in rows]}


def _map_summary(row: dict) -> dict:
    model = row["model"] or {}
    return {
        "id": str(row["id"]),
        "status": row["status"],
        "product": model.get("product"),
        "counts": {
            name: len(model.get(name) or [])
            for name in ("capabilities", "journeys", "proofSurfaces", "actors")
        },
    }


@router.get("/reconnaissance/{recon_id}")
async def read_reconnaissance(recon_id: uuid.UUID, who: Caller = Depends(caller)) -> dict:
    row = await _row(who, "reconnaissance", recon_id, "id, status, model, plan")
    return {"id": str(row["id"]), "status": row["status"], "model": row["model"], "plan": row["plan"]}


@router.post("/productions", status_code=201)
async def begin_production(request: ProductionRequest, who: Caller = Depends(caller)) -> dict:
    try:
        estimate = (
            request.estimated_credits
            if request.estimated_credits is not None
            else estimate_credits(request.scenario)
        )
    except ValueError as unpriceable:
        raise HTTPException(status_code=400, detail=str(unpriceable)) from unpriceable
    async with workspace_session(who.workspace_id) as session:
        production = await start_production(
            session, who.workspace_id, request.scenario, request.config, estimate
        )
    return {"id": str(production), "status": "capturing", "estimatedCredits": estimate}


@router.get("/productions")
async def list_productions(who: Caller = Depends(caller)) -> dict:
    async with workspace_session(who.workspace_id) as session:
        rows = (await session.execute(
            text("""
                SELECT id, status, scenario->>'title' AS title, video_key, published_at, created_at
                FROM production ORDER BY created_at DESC
            """)
        )).mappings().all()
    return {
        "productions": [
            {
                "id": str(row["id"]),
                "title": row["title"],
                "status": row["status"],
                "hasVideo": row["video_key"] is not None,
                "published": row["published_at"].isoformat() if row["published_at"] else None,
            }
            for row in rows
        ]
    }


@router.get("/productions/{production_id}")
async def read_production(production_id: uuid.UUID, who: Caller = Depends(caller)) -> dict:
    row = await _row(who, "production", production_id, "id, status, video_key, published_at")
    return {
        "id": str(row["id"]),
        "status": row["status"],
        "video": presign_get(row["video_key"]) if row["video_key"] else None,
        "published": row["published_at"].isoformat() if row["published_at"] else None,
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


@router.post("/productions/{production_id}/publish")
async def publish_production(production_id: uuid.UUID, who: Caller = Depends(caller)) -> dict:
    await _row(who, "production", production_id, "id")
    async with workspace_session(who.workspace_id) as session:
        try:
            await publish(session, production_id)
        except PublicationRefused as refusal:
            raise HTTPException(status_code=409, detail=str(refusal)) from refusal
        await record(session, who.workspace_id, who.user_id, "published", "production", production_id)
    return {"published": True}


@router.post("/productions/{production_id}/share", status_code=201)
async def share_production(production_id: uuid.UUID, who: Caller = Depends(caller)) -> dict:
    await _row(who, "production", production_id, "id")
    async with workspace_session(who.workspace_id) as session:
        try:
            token = await share(session, who.workspace_id, production_id)
        except SharingRefused as refusal:
            raise HTTPException(status_code=409, detail=str(refusal)) from refusal
        await record(session, who.workspace_id, who.user_id, "shared", "production", production_id)
    return {"token": token, "url": f"/watch/{token}"}


@router.get("/audit")
async def read_audit(who: Caller = Depends(caller)) -> dict:
    async with workspace_session(who.workspace_id) as session:
        events = await timeline(session)
    return {
        "events": [
            {
                "actor": event["actor"],
                "action": event["action"],
                "subject": {"type": event["subject_type"], "id": str(event["subject_id"] or "")},
                "at": event["created_at"].isoformat(),
            }
            for event in events
        ]
    }
