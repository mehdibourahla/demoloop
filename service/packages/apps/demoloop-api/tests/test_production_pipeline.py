import os
import subprocess

from demoloop_core.db import admin_engine, workspace_session
from demoloop_core.pipeline import start_production
from demoloop_core.settings import settings
from demoloop_core.storage import client as storage_client
from sqlalchemy import text
from test_capture_end_to_end import API_PORT, APP_PORT, REPO, SCENARIO, running_stack  # noqa: F401


def run_worker(kinds: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["npx", "tsx", "runner/src/main.ts", "--once"],
        cwd=REPO,
        env={**os.environ, "DEMOLOOP_API": f"http://127.0.0.1:{API_PORT}",
             "DEMOLOOP_RUNNER_TOKEN": "development-only", "DEMOLOOP_KINDS": kinds},
        capture_output=True, text=True, timeout=600,
    )


async def test_a_production_captures_then_renders_a_real_video(running_stack):  # noqa: F811
    import uuid
    workspace = uuid.uuid4()
    async with admin_engine().begin() as connection:
        await connection.execute(text("TRUNCATE workspace CASCADE"))
        await connection.execute(
            text("INSERT INTO workspace (id, name) VALUES (:id, 'Pipeline')"), {"id": workspace}
        )
    async with workspace_session(workspace) as session:
        production = await start_production(
            session, workspace, SCENARIO, {"app": {"url": f"http://127.0.0.1:{APP_PORT}"}}
        )

    captured = run_worker("capture")
    assert captured.returncode == 0, captured.stderr
    rendered = run_worker("render")
    assert rendered.returncode == 0, rendered.stderr
    evaluated = run_worker("evaluate")
    assert evaluated.returncode == 0, evaluated.stderr

    async with admin_engine().begin() as connection:
        row = (await connection.execute(
            text("SELECT status, video_key FROM production WHERE id = :id"), {"id": production}
        )).mappings().one()
        status, video_key = row["status"], row["video_key"]

    assert status == "complete"
    assert video_key.startswith(f"workspace/{workspace}/")
    head = storage_client().head_object(Bucket=settings().storage_bucket, Key=video_key)
    assert head["ContentLength"] > 10_000
