import uuid

import httpx
from demoloop_core.db import admin_engine
from sqlalchemy import text
from test_capture_end_to_end import API_PORT, APP_PORT, REPO, SCENARIO, running_stack  # noqa: F401
from test_production_pipeline import run_worker

BASE = f"http://127.0.0.1:{API_PORT}"


async def _workspace() -> uuid.UUID:
    workspace = uuid.uuid4()
    async with admin_engine().begin() as connection:
        await connection.execute(text("TRUNCATE workspace CASCADE"))
        await connection.execute(
            text("INSERT INTO workspace (id, name) VALUES (:id, 'Drift')"), {"id": workspace}
        )
        await connection.execute(
            text("INSERT INTO membership (id, workspace_id, user_id, role) VALUES (:id, :w, 'ada', 'owner')"),
            {"id": uuid.uuid4(), "w": workspace},
        )
        await connection.execute(
            text("INSERT INTO credit_balance (workspace_id, granted) VALUES (:w, 1000)"),
            {"w": workspace},
        )
    return workspace


async def test_a_demo_is_fresh_against_the_product_it_was_recorded_from(running_stack):  # noqa: F811
    workspace = await _workspace()
    who = {"X-Demoloop-User": "ada", "X-Demoloop-Workspace": str(workspace)}
    config = {"app": {"url": f"http://127.0.0.1:{APP_PORT}"}}

    production = httpx.post(
        f"{BASE}/v1/productions", json={"scenario": SCENARIO, "config": config}, headers=who, timeout=30
    ).json()
    check = httpx.post(
        f"{BASE}/v1/productions/{production['id']}/verifications", headers=who, timeout=30
    ).json()
    assert run_worker("verify").returncode == 0

    health = httpx.get(f"{BASE}/v1/verifications/{check['id']}", headers=who, timeout=30).json()

    assert health["status"] == "fresh"
    assert health["drifted"] == []
    assert health["checkedAt"] is not None


async def test_a_renamed_control_surfaces_as_drift_naming_the_scene(running_stack):  # noqa: F811
    workspace = await _workspace()
    who = {"X-Demoloop-User": "ada", "X-Demoloop-Workspace": str(workspace)}
    config = {"app": {"url": f"http://127.0.0.1:{APP_PORT}"}}
    moved = {
        **SCENARIO,
        "scenes": [{
            **SCENARIO["scenes"][0],
            "actions": [
                SCENARIO["scenes"][0]["actions"][0],
                {"type": "click", "target": {"by": "role", "role": "button", "value": "Create record"}},
            ],
        }],
    }

    production = httpx.post(
        f"{BASE}/v1/productions", json={"scenario": moved, "config": config}, headers=who, timeout=30
    ).json()
    check = httpx.post(
        f"{BASE}/v1/productions/{production['id']}/verifications", headers=who, timeout=30
    ).json()
    assert run_worker("verify").returncode == 0

    health = httpx.get(f"{BASE}/v1/verifications/{check['id']}", headers=who, timeout=30).json()

    assert health["status"] == "drifted"
    assert len(health["drifted"]) == 1
    assert health["drifted"][0]["sceneId"] == "create"
    assert health["drifted"][0]["label"] == "Create record"
