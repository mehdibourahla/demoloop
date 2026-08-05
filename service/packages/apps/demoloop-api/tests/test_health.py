from fastapi.testclient import TestClient

from demoloop_api.app import create_app


def test_health_reports_the_running_environment():
    client = TestClient(create_app())

    response = client.get("/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "env": "test"}
