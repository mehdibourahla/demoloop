import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

POLICIES = {"ephemeral-branch", "reset-hook", "seeded-tenant", "read-only"}


class ProductionRefused(Exception):
    pass


async def register(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    product_id: uuid.UUID,
    name: str,
    url: str,
    is_production: bool = False,
    data_policy: str = "read-only",
    secret_ref: str | None = None,
    reset_command: str | None = None,
    seed_command: str | None = None,
) -> uuid.UUID:
    if data_policy not in POLICIES:
        raise ValueError(f"unknown data policy: {data_policy}")
    environment = uuid.uuid4()
    await session.execute(
        text("""
            INSERT INTO environment
                (id, workspace_id, product_id, name, url, is_production,
                 data_policy, secret_ref, reset_command, seed_command)
            VALUES (:id, :w, :p, :name, :url, :prod, :policy, :secret, :reset, :seed)
        """),
        {
            "id": environment, "w": workspace_id, "p": product_id, "name": name, "url": url,
            "prod": is_production, "policy": data_policy, "secret": secret_ref,
            "reset": reset_command, "seed": seed_command,
        },
    )
    return environment


async def capture_config(session: AsyncSession, environment_id: uuid.UUID, acknowledged: bool) -> dict:
    row = (await session.execute(
        text("""
            SELECT url, is_production, data_policy, reset_command, seed_command
            FROM environment WHERE id = :id
        """),
        {"id": environment_id},
    )).mappings().one()

    if row["is_production"] and not acknowledged:
        raise ProductionRefused(
            "recording against a production environment requires an explicit acknowledgement every time"
        )

    config: dict = {"app": {"url": row["url"], "production": row["is_production"]}}
    if row["is_production"]:
        config["privacy"] = {"allowProduction": True}
    if row["reset_command"] or row["seed_command"]:
        config["preconditions"] = {
            "resetCommand": row["reset_command"],
            "seedCommand": row["seed_command"],
        }
    return config
