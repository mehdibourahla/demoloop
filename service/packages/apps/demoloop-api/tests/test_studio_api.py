import uuid

import httpx
import pytest_asyncio
from demoloop_api.app import create_app
from demoloop_core.db import admin_engine
from sqlalchemy import text


def client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url="http://test")


@pytest_asyncio.fixture
async def member():
    workspace, other = uuid.uuid4(), uuid.uuid4()
    async with admin_engine().begin() as connection:
        await connection.execute(text("TRUNCATE workspace CASCADE"))
        for identifier, name in ((workspace, "Mine"), (other, "Theirs")):
            await connection.execute(
                text("INSERT INTO workspace (id, name) VALUES (:id, :name)"), {"id": identifier, "name": name}
            )
        await connection.execute(
            text("INSERT INTO membership (id, workspace_id, user_id, role) VALUES (:id, :w, 'ada', 'owner')"),
            {"id": uuid.uuid4(), "w": workspace},
        )
        await connection.execute(
            text("INSERT INTO membership (id, workspace_id, user_id, role) VALUES (:id, :w, 'grace', 'owner')"),
            {"id": uuid.uuid4(), "w": other},
        )
    return workspace, other


def headers(user: str, workspace: uuid.UUID) -> dict:
    return {"X-Demoloop-User": user, "X-Demoloop-Workspace": str(workspace)}


async def test_an_anonymous_caller_is_refused(member):
    workspace, _ = member
    async with client() as http:
        response = await http.post("/v1/reconnaissance", json={"config": {"app": {"url": "http://127.0.0.1:4173"}}})
    assert response.status_code == 401


async def test_a_member_starts_reconnaissance_and_reads_it_back(member):
    workspace, _ = member
    async with client() as http:
        created = await http.post(
            "/v1/reconnaissance",
            json={"config": {"app": {"url": "http://127.0.0.1:4173"}}},
            headers=headers("ada", workspace),
        )
        fetched = await http.get(f"/v1/reconnaissance/{created.json()['id']}", headers=headers("ada", workspace))

    assert created.status_code == 201
    assert fetched.status_code == 200
    assert fetched.json()["status"] == "discovering"


async def test_a_non_member_cannot_act_in_that_workspace(member):
    workspace, _ = member
    async with client() as http:
        response = await http.post(
            "/v1/reconnaissance",
            json={"config": {"app": {"url": "http://127.0.0.1:4173"}}},
            headers=headers("grace", workspace),
        )
    assert response.status_code == 403


async def test_a_production_is_invisible_from_another_workspace(member):
    workspace, other = member
    async with client() as http:
        created = await http.post(
            "/v1/productions",
            json={"scenario": {"id": "demo", "scenes": [1]}, "config": {"app": {"url": "http://127.0.0.1:4173"}}},
            headers=headers("ada", workspace),
        )
        stolen = await http.get(f"/v1/productions/{created.json()['id']}", headers=headers("grace", other))

    assert created.status_code == 201
    assert stolen.status_code == 404


async def test_a_production_is_priced_from_its_scenario_when_no_estimate_is_given(member):
    workspace, _ = member
    scenario = {"id": "demo", "requestedDurationSeconds": 110, "scenes": [1, 2, 3, 4, 5, 6]}

    async with client() as http:
        created = await http.post(
            "/v1/productions",
            json={"scenario": scenario, "config": {"app": {"url": "http://127.0.0.1:4173"}}},
            headers=headers("ada", workspace),
        )

    assert created.status_code == 201
    assert created.json()["estimatedCredits"] == 12


async def test_a_scenario_that_cannot_be_priced_is_refused(member):
    workspace, _ = member

    async with client() as http:
        refused = await http.post(
            "/v1/productions",
            json={"scenario": {"id": "demo", "scenes": []}, "config": {"app": {"url": "http://x"}}},
            headers=headers("ada", workspace),
        )

    assert refused.status_code == 400
    assert "no scenes" in refused.json()["detail"]


async def test_the_library_lists_only_this_workspaces_productions(member):
    workspace, other = member
    config = {"app": {"url": "http://127.0.0.1:4173"}}
    scenario = {"id": "demo", "title": "Deliver an item", "scenes": [1, 2]}

    async with client() as http:
        await http.post("/v1/productions", json={"scenario": scenario, "config": config},
                        headers=headers("ada", workspace))
        await http.post("/v1/productions", json={"scenario": scenario, "config": config},
                        headers=headers("grace", other))

        mine = await http.get("/v1/productions", headers=headers("ada", workspace))

    assert mine.status_code == 200
    listed = mine.json()["productions"]
    assert len(listed) == 1
    assert listed[0]["title"] == "Deliver an item"
    assert listed[0]["status"] == "capturing"


async def test_the_library_is_newest_first(member):
    workspace, _ = member
    config = {"app": {"url": "http://127.0.0.1:4173"}}

    async with client() as http:
        for title in ("First", "Second"):
            await http.post(
                "/v1/productions",
                json={"scenario": {"id": "d", "title": title, "scenes": [1]}, "config": config},
                headers=headers("ada", workspace),
            )
        listed = (await http.get("/v1/productions", headers=headers("ada", workspace))).json()["productions"]

    assert [entry["title"] for entry in listed] == ["Second", "First"]


async def test_an_empty_library_is_an_empty_list_not_an_error(member):
    workspace, _ = member

    async with client() as http:
        listed = await http.get("/v1/productions", headers=headers("ada", workspace))

    assert listed.status_code == 200
    assert listed.json()["productions"] == []


async def test_a_shared_link_is_watchable_without_any_session(member):
    workspace, _ = member
    production = uuid.uuid4()
    async with admin_engine().begin() as connection:
        await connection.execute(
            text("""
                INSERT INTO production
                    (id, workspace_id, scenario, config, status, video_key, quality, provenance, published_at)
                VALUES (:id, :w, CAST(:s AS JSONB), '{}'::jsonb, 'complete', 'k/v',
                        CAST(:q AS JSONB), CAST(:p AS JSONB), now())
            """),
            {"id": production, "w": workspace, "s": '{"title": "Deliver an item"}',
             "q": '{"status": "accepted", "passed": true, "agentReview": {"score": 8.4}}',
             "p": '{"commit": "8f2c1a9", "appUrl": "https://staging.example.com"}'},
        )

    async with client() as http:
        shared = await http.post(
            f"/v1/productions/{production}/share", headers=headers("ada", workspace)
        )
        token = shared.json()["token"]
        watched = await http.get(f"/public/watch/{token}")

    assert shared.status_code == 201
    assert watched.status_code == 200
    assert watched.json()["receipt"]["commit"] == "8f2c1a9"
    assert watched.json()["video"], "a shared demo must actually be playable"


async def test_an_unknown_share_link_is_not_found():
    async with client() as http:
        missing = await http.get("/public/watch/nope")

    assert missing.status_code == 404


async def test_publishing_and_sharing_are_both_written_to_the_audit_log(member):
    workspace, _ = member
    production = uuid.uuid4()
    async with admin_engine().begin() as connection:
        await connection.execute(
            text("""
                INSERT INTO production
                    (id, workspace_id, scenario, config, status, video_key, quality, published_at)
                VALUES (:id, :w, '{}'::jsonb, '{}'::jsonb, 'complete', 'k/v', CAST(:q AS JSONB), now())
            """),
            {"id": production, "w": workspace, "q": '{"status": "accepted", "passed": true}'},
        )

    async with client() as http:
        await http.post(f"/v1/productions/{production}/share", headers=headers("ada", workspace))
        audit = await http.get("/v1/audit", headers=headers("ada", workspace))

    actions = [event["action"] for event in audit.json()["events"]]
    assert "shared" in actions
    assert audit.json()["events"][0]["actor"] == "ada"
