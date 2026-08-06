import uuid

import httpx
from demoloop_core.db import admin_engine
from sqlalchemy import text
from test_capture_end_to_end import API_PORT, APP_PORT, REPO, running_stack  # noqa: F401
from test_production_pipeline import run_worker

BASE = f"http://127.0.0.1:{API_PORT}"


async def test_a_customer_goes_from_a_repository_to_a_playable_video(running_stack):  # noqa: F811
    workspace = uuid.uuid4()
    async with admin_engine().begin() as connection:
        await connection.execute(text("TRUNCATE workspace CASCADE"))
        await connection.execute(
            text("INSERT INTO workspace (id, name) VALUES (:id, 'Journey')"), {"id": workspace}
        )
        await connection.execute(
            text("INSERT INTO membership (id, workspace_id, user_id, role) VALUES (:id, :w, 'ada', 'owner')"),
            {"id": uuid.uuid4(), "w": workspace},
        )
        await connection.execute(
            text("INSERT INTO credit_balance (workspace_id, granted) VALUES (:w, 1000)"),
            {"w": workspace},
        )
    who = {"X-Demoloop-User": "ada", "X-Demoloop-Workspace": str(workspace)}
    config = {
        "app": {"url": f"http://127.0.0.1:{APP_PORT}"},
        "repository": {"root": str(REPO / "fixtures" / "neutral" / "handoff")},
    }

    recon = httpx.post(f"{BASE}/v1/reconnaissance", json={"config": config}, headers=who, timeout=30).json()
    assert run_worker("discover").returncode == 0
    assert run_worker("plan").returncode == 0

    mapped = httpx.get(f"{BASE}/v1/reconnaissance/{recon['id']}", headers=who, timeout=30).json()
    assert mapped["status"] == "complete"
    scenario = mapped["plan"]["outputs"][0]

    production = httpx.post(
        f"{BASE}/v1/productions", json={"scenario": scenario, "config": config}, headers=who, timeout=30
    ).json()
    for kind in ("capture", "render", "evaluate"):
        result = run_worker(kind)
        assert result.returncode == 0, f"{kind}: {result.stderr}"

    finished = httpx.get(f"{BASE}/v1/productions/{production['id']}", headers=who, timeout=30).json()

    assert finished["status"] == "reviewing"
    assert finished["video"], "no playable video was offered"
    playable = httpx.get(finished["video"], timeout=60)
    assert playable.status_code == 200
    assert len(playable.content) > 10_000
    assert playable.content[4:8] == b"ftyp"
