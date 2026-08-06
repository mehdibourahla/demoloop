import uuid

import httpx
from demoloop_core.agents.reviewer import Reviewed
from demoloop_core.db import admin_engine
from demoloop_core.workers.review import review_once
from sqlalchemy import text
from test_capture_end_to_end import API_PORT, APP_PORT, SCENARIO, running_stack  # noqa: F401
from test_production_pipeline import run_worker

BASE = f"http://127.0.0.1:{API_PORT}"


class AcceptingReviewer:
    def __init__(self):
        self.frames = 0

    async def watch(self, frames, transcript, context):
        self.frames = len(frames)
        return Reviewed(verdict="accept", score=8.4, summary="a coherent demonstration")


async def test_a_watched_video_becomes_publishable(running_stack):  # noqa: F811
    workspace = uuid.uuid4()
    async with admin_engine().begin() as connection:
        await connection.execute(text("TRUNCATE workspace CASCADE"))
        await connection.execute(
            text("INSERT INTO workspace (id, name) VALUES (:id, 'Review')"), {"id": workspace}
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

    refused = httpx.post(f"{BASE}/v1/productions/{production['id']}/publish", headers=who, timeout=30)

    reviewer = AcceptingReviewer()
    assert await review_once(reviewer) == "reviewed"

    allowed = httpx.post(f"{BASE}/v1/productions/{production['id']}/publish", headers=who, timeout=60)
    final = httpx.get(f"{BASE}/v1/productions/{production['id']}", headers=who, timeout=30).json()

    assert refused.status_code == 409
    assert reviewer.frames > 0, "the reviewer was never shown a frame of the real master"
    assert allowed.status_code == 200
    assert final["status"] == "complete"
    assert final["published"] is not None
