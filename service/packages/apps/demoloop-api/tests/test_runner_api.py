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


async def test_upload_urls_are_scoped_to_the_leased_job(queued_capture_job):
    async with client() as http:
        leased = (await http.post("/v1/jobs/lease", json={"kinds": ["capture"]}, headers=HEADERS)).json()
        job_id = leased["job"]["id"]

        granted = await http.post(
            f"/v1/jobs/{job_id}/uploads",
            json={"lease_token": leased["lease_token"], "names": ["timeline", "raw-create"]},
            headers=HEADERS,
        )

    assert granted.status_code == 200
    urls = granted.json()["urls"]
    assert set(urls) == {"timeline", "raw-create"}
    assert f"production/{job_id}/timeline" in urls["timeline"]
    assert str(queued_capture_job) in urls["timeline"]


async def test_a_stale_lease_cannot_obtain_upload_urls(queued_capture_job):
    async with client() as http:
        leased = (await http.post("/v1/jobs/lease", json={"kinds": ["capture"]}, headers=HEADERS)).json()

        refused = await http.post(
            f"/v1/jobs/{leased['job']['id']}/uploads",
            json={"lease_token": "00000000-0000-0000-0000-000000000000", "names": ["timeline"]},
            headers=HEADERS,
        )

    assert refused.status_code == 409


async def test_an_unstorable_artifact_name_is_refused(queued_capture_job):
    async with client() as http:
        leased = (await http.post("/v1/jobs/lease", json={"kinds": ["capture"]}, headers=HEADERS)).json()

        refused = await http.post(
            f"/v1/jobs/{leased['job']['id']}/uploads",
            json={"lease_token": leased["lease_token"], "names": ["../../etc/passwd"]},
            headers=HEADERS,
        )

    assert refused.status_code == 400


async def test_download_urls_require_the_lease(queued_capture_job):
    async with client() as http:
        leased = (await http.post("/v1/jobs/lease", json={"kinds": ["capture"]}, headers=HEADERS)).json()
        job_id = leased["job"]["id"]
        granted = (await http.post(
            f"/v1/jobs/{job_id}/uploads",
            json={"lease_token": leased["lease_token"], "names": ["timeline"]},
            headers=HEADERS,
        )).json()
        key = granted["keys"]["timeline"]

        allowed = await http.post(
            f"/v1/jobs/{job_id}/downloads",
            json={"lease_token": leased["lease_token"], "keys": [key]}, headers=HEADERS,
        )
        refused = await http.post(
            f"/v1/jobs/{job_id}/downloads",
            json={"lease_token": "00000000-0000-0000-0000-000000000000", "keys": [key]}, headers=HEADERS,
        )

    assert allowed.status_code == 200
    assert key in allowed.json()["urls"]
    assert refused.status_code == 409


async def test_a_worker_cannot_download_another_workspaces_object(queued_capture_job):
    async with client() as http:
        leased = (await http.post("/v1/jobs/lease", json={"kinds": ["capture"]}, headers=HEADERS)).json()

        refused = await http.post(
            f"/v1/jobs/{leased['job']['id']}/downloads",
            json={"lease_token": leased["lease_token"], "keys": ["workspace/00000000-0000-0000-0000-000000000000/production/x/secret"]},
            headers=HEADERS,
        )

    assert refused.status_code == 403
