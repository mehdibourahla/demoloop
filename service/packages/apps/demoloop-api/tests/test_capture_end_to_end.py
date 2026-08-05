import json
import os
import subprocess
import time
import uuid
from pathlib import Path

import httpx
import pytest
import pytest_asyncio
from demoloop_core.db import admin_engine, workspace_session
from demoloop_core.jobs import enqueue
from sqlalchemy import text

REPO = Path(__file__).resolve().parents[5]
API_PORT = 8099
APP_PORT = 4173

SCENARIO = {
    "version": 2,
    "id": "spine-check",
    "title": "Spine check",
    "outputType": "feature-clip",
    "audience": "operators",
    "actors": [{"id": "operator", "label": "Operator"}],
    "scenes": [
        {
            "id": "create",
            "title": "Create an item",
            "purpose": "state-change",
            "actor": "operator",
            "actions": [
                {"type": "goto", "path": "/stateful"},
                {"type": "click", "target": {"by": "role", "role": "button", "value": "Create item"}},
                {"type": "assert", "target": {"by": "text", "value": "Item created"}, "state": "visible"},
            ],
        }
    ],
}


def wait_for(url: str, timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if httpx.get(url, timeout=1).status_code < 500:
                return
        except Exception:
            time.sleep(0.2)
    raise RuntimeError(f"{url} never became reachable")


@pytest.fixture(scope="module")
def running_stack():
    app = subprocess.Popen(
        ["node", "--import", "tsx", "fixtures/neutral/server.ts"],
        cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    api = subprocess.Popen(
        ["uv", "run", "uvicorn", "demoloop_api.app:create_app", "--factory", "--port", str(API_PORT)],
        cwd=REPO / "service", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        wait_for(f"http://127.0.0.1:{APP_PORT}/health")
        wait_for(f"http://127.0.0.1:{API_PORT}/v1/health")
        yield
    finally:
        api.terminate()
        app.terminate()


@pytest_asyncio.fixture
async def enqueued_capture():
    workspace = uuid.uuid4()
    async with admin_engine().begin() as connection:
        await connection.execute(text("TRUNCATE workspace CASCADE"))
        await connection.execute(
            text("INSERT INTO workspace (id, name) VALUES (:id, 'Spine')"), {"id": workspace}
        )
    async with workspace_session(workspace) as session:
        job = await enqueue(session, workspace, "capture", {
            "scenario": SCENARIO,
            "config": {"app": {"url": f"http://127.0.0.1:{APP_PORT}"}},
            "device": "desktop",
        })
        return job.id


async def test_a_capture_job_flows_through_the_runner_and_back(running_stack, enqueued_capture):
    completed = subprocess.run(
        ["npx", "tsx", "runner/src/main.ts", "--once"],
        cwd=REPO,
        env={**os.environ, "DEMOLOOP_API": f"http://127.0.0.1:{API_PORT}", "DEMOLOOP_RUNNER_TOKEN": "development-only"},
        capture_output=True, text=True, timeout=300,
    )

    assert completed.returncode == 0, completed.stderr
    assert "completed" in completed.stdout

    async with admin_engine().begin() as connection:
        row = (await connection.execute(
            text("SELECT status, result FROM job WHERE id = :id"), {"id": enqueued_capture}
        )).mappings().one()

    assert row["status"] == "done"
    result = row["result"] if isinstance(row["result"], dict) else json.loads(row["result"])
    assert result["passed"] is True
    assert result["mode"] == "record"
    assert result["provenance"]["appUrl"] == f"http://127.0.0.1:{APP_PORT}"
