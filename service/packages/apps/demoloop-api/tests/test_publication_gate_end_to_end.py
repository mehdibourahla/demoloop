import uuid

import httpx
from demoloop_core.db import admin_engine
from sqlalchemy import text
from test_capture_end_to_end import API_PORT, APP_PORT, REPO, SCENARIO, running_stack  # noqa: F401
from test_production_pipeline import run_worker

BASE = f"http://127.0.0.1:{API_PORT}"


async def test_a_video_no_agent_watched_is_refused_publication(running_stack):  # noqa: F811
    workspace = uuid.uuid4()
    async with admin_engine().begin() as connection:
        await connection.execute(text("TRUNCATE workspace CASCADE"))
        await connection.execute(
            text("INSERT INTO workspace (id, name) VALUES (:id, 'Gate')"), {"id": workspace}
        )
        await connection.execute(
            text("INSERT INTO membership (id, workspace_id, user_id, role) VALUES (:id, :w, 'ada', 'owner')"),
            {"id": uuid.uuid4(), "w": workspace},
        )
    who = {"X-Demoloop-User": "ada", "X-Demoloop-Workspace": str(workspace)}
    config = {"app": {"url": f"http://127.0.0.1:{APP_PORT}"}}

    production = httpx.post(
        f"{BASE}/v1/productions", json={"scenario": SCENARIO, "config": config}, headers=who, timeout=30
    ).json()
    for kind in ("capture", "render", "evaluate"):
        assert run_worker(kind).returncode == 0, kind

    state = httpx.get(f"{BASE}/v1/productions/{production['id']}", headers=who, timeout=30).json()
    refused = httpx.post(f"{BASE}/v1/productions/{production['id']}/publish", headers=who, timeout=30)

    assert state["status"] == "reviewing"
    assert state["video"], "the master should exist even though it may not be published"
    assert state["published"] is None
    assert refused.status_code == 409
    assert "waiting for an agent to watch it" in refused.json()["detail"]
