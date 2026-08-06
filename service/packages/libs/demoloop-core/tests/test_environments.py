import uuid

import pytest
from demoloop_core.db import workspace_session
from demoloop_core.environments import (
    POLICIES,
    ProductionRefused,
    capture_config,
    register,
)
from sqlalchemy import text


async def _product(workspace) -> uuid.UUID:
    product = uuid.uuid4()
    async with workspace_session(workspace) as session:
        await session.execute(
            text("INSERT INTO product (id, workspace_id, name) VALUES (:id, :w, 'App')"),
            {"id": product, "w": workspace},
        )
    return product


def test_the_prd_names_four_data_policies():
    assert set(POLICIES) == {"ephemeral-branch", "reset-hook", "seeded-tenant", "read-only"}


async def test_an_environment_never_stores_a_credential_only_a_reference(seeded_workspaces):
    workspace, _ = seeded_workspaces
    product = await _product(workspace)

    async with workspace_session(workspace) as session:
        environment = await register(
            session, workspace, product, name="staging",
            url="https://staging.example.com", secret_ref="projects/x/secrets/staging",
        )
        stored = (await session.execute(
            text("SELECT secret_ref FROM environment WHERE id = :id"), {"id": environment}
        )).scalar_one()

    assert stored == "projects/x/secrets/staging"


async def test_a_state_changing_run_against_production_is_refused_without_acknowledgement(seeded_workspaces):
    workspace, _ = seeded_workspaces
    product = await _product(workspace)

    async with workspace_session(workspace) as session:
        environment = await register(
            session, workspace, product, name="prod",
            url="https://app.example.com", is_production=True, data_policy="read-only",
        )

        with pytest.raises(ProductionRefused, match="acknowledge"):
            await capture_config(session, environment, acknowledged=False)

        config = await capture_config(session, environment, acknowledged=True)

    assert config["app"]["production"] is True


async def test_a_reset_hook_environment_carries_its_commands_into_capture(seeded_workspaces):
    workspace, _ = seeded_workspaces
    product = await _product(workspace)

    async with workspace_session(workspace) as session:
        environment = await register(
            session, workspace, product, name="local", url="http://127.0.0.1:4173",
            data_policy="reset-hook", reset_command="npm run db:reset", seed_command="npm run db:seed",
        )
        config = await capture_config(session, environment, acknowledged=False)

    assert config["preconditions"] == {"resetCommand": "npm run db:reset", "seedCommand": "npm run db:seed"}


async def test_an_unknown_data_policy_is_refused_at_registration(seeded_workspaces):
    workspace, _ = seeded_workspaces
    product = await _product(workspace)

    async with workspace_session(workspace) as session:
        with pytest.raises(ValueError, match="data policy"):
            await register(session, workspace, product, name="x", url="http://x", data_policy="hope")
