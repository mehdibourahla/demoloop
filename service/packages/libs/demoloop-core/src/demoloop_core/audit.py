import json
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def record(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    actor: str,
    action: str,
    subject_type: str,
    subject_id: uuid.UUID | None = None,
    detail: dict | None = None,
) -> None:
    await session.execute(
        text("""
            INSERT INTO audit_event (id, workspace_id, actor, action, subject_type, subject_id, detail)
            VALUES (:id, :w, :actor, :action, :type, :subject, CAST(:detail AS JSONB))
        """),
        {
            "id": uuid.uuid4(), "w": workspace_id, "actor": actor, "action": action,
            "type": subject_type, "subject": subject_id, "detail": json.dumps(detail or {}),
        },
    )


async def timeline(session: AsyncSession, limit: int = 200) -> list[dict]:
    rows = (await session.execute(
        text("""
            SELECT actor, action, subject_type, subject_id, detail, created_at
            FROM audit_event ORDER BY created_at DESC LIMIT :limit
        """),
        {"limit": limit},
    )).mappings().all()
    return [dict(row) for row in rows]
