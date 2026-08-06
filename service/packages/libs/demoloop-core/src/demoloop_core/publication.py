import json
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class PublicationRefused(Exception):
    pass


async def publish(session: AsyncSession, production_id: uuid.UUID) -> None:
    row = (await session.execute(
        text("SELECT status, video_key, quality FROM production WHERE id = :id"), {"id": production_id}
    )).mappings().one_or_none()
    if row is None:
        raise PublicationRefused("that production does not exist")
    if row["status"] == "reviewing":
        raise PublicationRefused("this video is waiting for an agent to watch it")
    if row["status"] != "complete" or not row["video_key"]:
        raise PublicationRefused("the production is not complete")

    quality = row["quality"] if isinstance(row["quality"], dict) else json.loads(row["quality"] or "{}")
    status = quality.get("status")
    if status == "rejected":
        raise PublicationRefused("the quality gate rejected this video")
    if status != "accepted" or not quality.get("passed"):
        raise PublicationRefused("this video has not been reviewed by an agent")

    await session.execute(
        text("UPDATE production SET published_at = now() WHERE id = :id"), {"id": production_id}
    )
