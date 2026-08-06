import secrets
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from demoloop_core.db import dispatch_session


class SharingRefused(Exception):
    pass


async def share(session: AsyncSession, workspace_id: uuid.UUID, production_id: uuid.UUID) -> str:
    published = (await session.execute(
        text("SELECT published_at FROM production WHERE id = :id"), {"id": production_id}
    )).scalar_one_or_none()
    if published is None:
        raise SharingRefused("a demo that is not published cannot be shared")

    token = secrets.token_urlsafe(32)
    await session.execute(
        text("""
            INSERT INTO share_link (id, workspace_id, production_id, token, access)
            VALUES (:id, :w, :p, :t, 'link')
        """),
        {"id": uuid.uuid4(), "w": workspace_id, "p": production_id, "t": token},
    )
    return token


async def resolve(token: str) -> dict | None:
    async with dispatch_session() as session:
        row = (await session.execute(
            text("""
                SELECT p.id, p.scenario->>'title' AS title, p.video_key, p.quality,
                       p.provenance, p.published_at
                FROM share_link s JOIN production p ON p.id = s.production_id
                WHERE s.token = :t AND s.revoked_at IS NULL AND p.published_at IS NOT NULL
            """),
            {"t": token},
        )).mappings().one_or_none()
    return dict(row) if row else None


def receipt_for(found: dict) -> dict:
    provenance = found.get("provenance") or {}
    quality = found.get("quality") or {}
    return {
        "title": found.get("title"),
        "commit": provenance.get("commit"),
        "environment": provenance.get("appUrl"),
        "dirty": provenance.get("dirty"),
        "recordedAt": found["published_at"].isoformat() if found.get("published_at") else None,
        "agentScore": (quality.get("agentReview") or {}).get("score"),
        "accepted": quality.get("status") == "accepted",
    }
