import uuid

from demoloop_core.db import dispatch_session
from demoloop_core.jobs import beat, claim, finish, leased_job
from demoloop_core.pipeline import advance
from demoloop_core.settings import settings
from demoloop_core.storage import artifact_key, ensure_bucket, presign_get, presign_put
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

router = APIRouter(prefix="/v1/jobs", tags=["runner"])
bearer = HTTPBearer(auto_error=False)

LEASE_SECONDS = 60


def authenticated(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> None:
    if credentials is None or credentials.credentials != settings().runner_shared_secret:
        raise HTTPException(status_code=401, detail="runner authentication required")


class LeaseRequest(BaseModel):
    kinds: list[str]


class TokenRequest(BaseModel):
    lease_token: uuid.UUID


class FinishRequest(TokenRequest):
    result: dict


class UploadRequest(TokenRequest):
    names: list[str]


class DownloadRequest(TokenRequest):
    keys: list[str]


@router.post("/lease", dependencies=[Depends(authenticated)], response_model=None)
async def lease(request: LeaseRequest) -> dict | Response:
    async with dispatch_session() as session:
        job = await claim(session, request.kinds, LEASE_SECONDS)
        if job is None:
            return Response(status_code=204)
        return {
            "job": {"id": str(job.id), "kind": job.kind, "payload": job.payload, "attempt": job.attempt},
            "lease_token": str(job.lease_token),
            "lease_seconds": LEASE_SECONDS,
        }


@router.post("/{job_id}/beat", dependencies=[Depends(authenticated)])
async def heartbeat(job_id: uuid.UUID, request: TokenRequest) -> dict:
    async with dispatch_session() as session:
        if not await beat(session, job_id, request.lease_token, LEASE_SECONDS):
            raise HTTPException(status_code=409, detail="lease lost")
    return {"continue": True}


@router.post("/{job_id}/finish", dependencies=[Depends(authenticated)])
async def complete(job_id: uuid.UUID, request: FinishRequest) -> dict:
    async with dispatch_session() as session:
        if not await finish(session, job_id, request.lease_token, request.result):
            raise HTTPException(status_code=409, detail="lease lost")
        await advance(session, job_id)
    return {"accepted": True}


@router.post("/{job_id}/uploads", dependencies=[Depends(authenticated)])
async def uploads(job_id: uuid.UUID, request: UploadRequest) -> dict:
    async with dispatch_session() as session:
        job = await leased_job(session, job_id, request.lease_token)
        if job is None:
            raise HTTPException(status_code=409, detail="lease lost")
        workspace_id = job["workspace_id"]
    ensure_bucket()
    try:
        keys = {name: artifact_key(workspace_id, job_id, name) for name in request.names}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {"urls": {name: presign_put(key) for name, key in keys.items()}, "keys": keys}


@router.post("/{job_id}/downloads", dependencies=[Depends(authenticated)])
async def downloads(job_id: uuid.UUID, request: DownloadRequest) -> dict:
    async with dispatch_session() as session:
        job = await leased_job(session, job_id, request.lease_token)
        if job is None:
            raise HTTPException(status_code=409, detail="lease lost")
        workspace_id = job["workspace_id"]
    prefix = f"workspace/{workspace_id}/"
    outside = [key for key in request.keys if not key.startswith(prefix)]
    if outside:
        raise HTTPException(status_code=403, detail="object is outside this workspace")
    return {"urls": {key: presign_get(key) for key in request.keys}}
