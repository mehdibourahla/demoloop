import uuid

from demoloop_core.db import admin_engine
from demoloop_core.settings import settings
from fastapi import Header, HTTPException
from sqlalchemy import text


class Caller:
    def __init__(self, user_id: str, workspace_id: uuid.UUID, role: str) -> None:
        self.user_id = user_id
        self.workspace_id = workspace_id
        self.role = role


async def caller(
    x_demoloop_user: str | None = Header(default=None),
    x_demoloop_workspace: str | None = Header(default=None),
) -> Caller:
    # The development stub stands in for the OIDC verifier; production-like environments refuse it.
    if settings().env not in {"test", "dev"}:
        raise HTTPException(status_code=500, detail="the development identity stub is not usable here")
    if not x_demoloop_user or not x_demoloop_workspace:
        raise HTTPException(status_code=401, detail="authentication required")
    try:
        workspace_id = uuid.UUID(x_demoloop_workspace)
    except ValueError as error:
        raise HTTPException(status_code=401, detail="workspace is not a valid identifier") from error

    async with admin_engine().begin() as connection:
        role = (await connection.execute(
            text("SELECT role FROM membership WHERE workspace_id = :w AND user_id = :u"),
            {"w": workspace_id, "u": x_demoloop_user},
        )).scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=403, detail="not a member of this workspace")
    return Caller(x_demoloop_user, workspace_id, role)
