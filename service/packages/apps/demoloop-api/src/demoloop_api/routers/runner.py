import uuid

from demoloop_core.db import dispatch_session
from demoloop_core.jobs import beat, claim, finish
from demoloop_core.settings import settings
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
    return {"accepted": True}
