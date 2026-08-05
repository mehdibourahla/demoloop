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
            json={"scenario": {"id": "demo"}, "config": {"app": {"url": "http://127.0.0.1:4173"}}},
            headers=headers("ada", workspace),
        )
        stolen = await http.get(f"/v1/productions/{created.json()['id']}", headers=headers("grace", other))

    assert created.status_code == 201
    assert stolen.status_code == 404
