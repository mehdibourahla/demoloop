import math
import uuid
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from demoloop_core.settings import settings


async def grant(session: AsyncSession, workspace_id: uuid.UUID, amount: Decimal) -> None:
    await session.execute(
        text("""
            INSERT INTO credit_balance (workspace_id, granted) VALUES (:workspace, :amount)
            ON CONFLICT (workspace_id) DO UPDATE SET granted = credit_balance.granted + :amount
        """),
        {"workspace": workspace_id, "amount": amount},
    )


async def available(session: AsyncSession, workspace_id: uuid.UUID) -> Decimal:
    value = (await session.execute(
        text("SELECT granted - spent - reserved FROM credit_balance WHERE workspace_id = :workspace"),
        {"workspace": workspace_id},
    )).scalar_one_or_none()
    return Decimal(0) if value is None else Decimal(value)


async def reserve(session: AsyncSession, workspace_id: uuid.UUID, amount: Decimal) -> bool:
    reserved = await session.execute(
        text("""
            UPDATE credit_balance SET reserved = reserved + :amount
            WHERE workspace_id = :workspace AND granted - spent - reserved >= :amount
        """),
        {"workspace": workspace_id, "amount": amount},
    )
    return reserved.rowcount == 1


async def settle(session: AsyncSession, workspace_id: uuid.UUID, reserved: Decimal, actual: Decimal) -> None:
    await session.execute(
        text("""
            UPDATE credit_balance SET reserved = GREATEST(reserved - :reserved, 0), spent = spent + :actual
            WHERE workspace_id = :workspace
        """),
        {"workspace": workspace_id, "reserved": reserved, "actual": actual},
    )


def estimate_credits(scenario: dict) -> int:
    """Credits a production is expected to cost, from its running time.

    The rate is recovered from the product spec rather than chosen: at 6.5 credits a
    minute, the PRD's own worked example (1 min 50 s) prices at 12 credits.
    """
    scenes = scenario.get("scenes") or []
    if not scenes:
        raise ValueError("a scenario with no scenes cannot be priced")
    seconds = scenario.get("requestedDurationSeconds") or len(scenes) * settings().seconds_per_scene
    return max(1, math.ceil(seconds / 60 * settings().credits_per_minute))
