import uuid

from demoloop_core.db import admin_engine, workspace_session
from demoloop_core.pipeline import start_reconnaissance
from sqlalchemy import text
from test_capture_end_to_end import APP_PORT, REPO, running_stack  # noqa: F401
from test_production_pipeline import run_worker


async def test_reconnaissance_maps_a_real_product_and_plans_a_demo(running_stack):  # noqa: F811
    workspace = uuid.uuid4()
    async with admin_engine().begin() as connection:
        await connection.execute(text("TRUNCATE workspace CASCADE"))
        await connection.execute(
            text("INSERT INTO workspace (id, name) VALUES (:id, 'Recon')"), {"id": workspace}
        )
    async with workspace_session(workspace) as session:
        recon = await start_reconnaissance(session, workspace, {
            "app": {"url": f"http://127.0.0.1:{APP_PORT}"},
            "repository": {"root": str(REPO / "fixtures" / "neutral" / "handoff")},
        })

    discovered = run_worker("discover")
    assert discovered.returncode == 0, discovered.stderr
    planned = run_worker("plan")
    assert planned.returncode == 0, planned.stderr

    async with admin_engine().begin() as connection:
        row = (await connection.execute(
            text("SELECT status, model, plan FROM reconnaissance WHERE id = :id"), {"id": recon}
        )).mappings().one()

    assert row["status"] == "complete"
    assert row["model"]["product"] == "Delivery Board"
    assert row["plan"]["status"] == "planned"
    assert len(row["plan"]["outputs"]) > 0

    runtime = [
        entry for surface in row["model"]["proofSurfaces"]
        for entry in surface["evidence"] if entry["type"] == "runtime"
    ]
    assert runtime, "discovery recorded no runtime evidence"
    assert all(not entry["screenshot"].startswith("/") for entry in runtime)
