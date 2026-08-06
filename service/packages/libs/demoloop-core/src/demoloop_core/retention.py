from collections.abc import Callable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

PLANS = {"free": 30, "pro": 365, "team": 1095, "enterprise": 3650}


def retention_days(plan: str) -> int:
    return PLANS.get(plan, PLANS["free"])


async def expired_artifacts(session: AsyncSession, plan: str) -> list[dict]:
    # A published demo keeps its recordings for as long as the video is shareable,
    # because a re-cut has to be possible without touching the customer again.
    rows = (await session.execute(
        text("""
            SELECT id, video_key FROM production
            WHERE published_at IS NULL
              AND created_at < now() - make_interval(days => :days)
            ORDER BY created_at
        """),
        {"days": retention_days(plan)},
    )).mappings().all()
    return [dict(row) for row in rows]


def _delete_object(key: str) -> None:
    from demoloop_core.settings import settings
    from demoloop_core.storage import client

    client().delete_object(Bucket=settings().storage_bucket, Key=key)


async def sweep(session: AsyncSession, plan: str, remove: Callable[[str], None] = _delete_object) -> int:
    swept = 0
    for entry in await expired_artifacts(session, plan):
        if not entry["video_key"]:
            continue
        try:
            remove(entry["video_key"])
        except Exception:
            # The key is only forgotten once the object is gone, or it is orphaned forever.
            continue
        await session.execute(
            text("UPDATE production SET video_key = NULL WHERE id = :id"), {"id": entry["id"]}
        )
        swept += 1
    return swept
