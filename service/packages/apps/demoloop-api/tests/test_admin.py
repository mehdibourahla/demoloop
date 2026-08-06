import httpx
import pytest
from demoloop_core.settings import Settings, settings


@pytest.fixture
def operator(monkeypatch):
    settings.cache_clear()
    monkeypatch.setattr("demoloop_core.settings.Settings", lambda: Settings(admin_token="operator-secret"))
    yield
    settings.cache_clear()


def client() -> httpx.AsyncClient:
    from demoloop_api.app import create_app

    return httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url="http://test")


async def test_the_operator_console_is_not_open_to_anyone_who_finds_it(operator):
    async with client() as http:
        response = await http.get("/admin/", follow_redirects=False)

    assert response.status_code in (302, 303, 307, 401, 403)


async def test_a_wrong_operator_token_is_refused(operator):
    async with client() as http:
        response = await http.post(
            "/admin/login", data={"username": "operator", "password": "wrong"}, follow_redirects=False
        )

    assert response.status_code in (400, 401, 403, 302, 303)


async def test_the_console_is_absent_when_no_operator_token_is_configured():
    settings.cache_clear()
    try:
        async with client() as http:
            response = await http.get("/admin/", follow_redirects=False)
        assert response.status_code == 404, "a default deployment must not expose an operator door"
    finally:
        settings.cache_clear()
