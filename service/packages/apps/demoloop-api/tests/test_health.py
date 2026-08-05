from demoloop_api.app import create_app
from fastapi.testclient import TestClient


def test_health_reports_the_running_environment():
    client = TestClient(create_app())

    response = client.get("/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "env": "test"}
