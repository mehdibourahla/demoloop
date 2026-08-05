import httpx
from demoloop_api.app import create_app

HEADERS = {"Authorization": "Bearer development-only"}


def client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url="http://test")


async def test_an_unauthenticated_runner_is_refused():
    async with client() as http:
        response = await http.post("/v1/jobs/lease", json={"kinds": ["capture"]})

    assert response.status_code == 401


async def test_leasing_returns_no_content_when_nothing_is_queued(empty_queue):
    async with client() as http:
        response = await http.post("/v1/jobs/lease", json={"kinds": ["capture"]}, headers=HEADERS)

    assert response.status_code == 204


async def test_a_leased_job_can_only_be_finished_with_its_token(queued_capture_job):
    async with client() as http:
        leased = (await http.post("/v1/jobs/lease", json={"kinds": ["capture"]}, headers=HEADERS)).json()

        wrong = await http.post(
            f"/v1/jobs/{leased['job']['id']}/finish",
            json={"lease_token": "00000000-0000-0000-0000-000000000000", "result": {"passed": True}},
            headers=HEADERS,
        )
        right = await http.post(
            f"/v1/jobs/{leased['job']['id']}/finish",
            json={"lease_token": leased["lease_token"], "result": {"passed": True}},
            headers=HEADERS,
        )

    assert wrong.status_code == 409
    assert right.status_code == 200
