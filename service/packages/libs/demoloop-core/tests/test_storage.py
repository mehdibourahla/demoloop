import uuid

import httpx
from demoloop_core.storage import artifact_key, ensure_bucket, presign_get, presign_put


def test_keys_are_namespaced_by_workspace_and_job():
    workspace, job = uuid.uuid4(), uuid.uuid4()

    key = artifact_key(workspace, job, "raw-create")

    assert key == f"workspace/{workspace}/production/{job}/raw-create"


def test_a_presigned_url_accepts_exactly_one_object():
    ensure_bucket()
    workspace, job = uuid.uuid4(), uuid.uuid4()
    key = artifact_key(workspace, job, "timeline")

    put = presign_put(key)
    uploaded = httpx.put(put, content=b'{"events":[]}', timeout=10)
    fetched = httpx.get(presign_get(key), timeout=10)

    assert uploaded.status_code == 200
    assert fetched.content == b'{"events":[]}'


def test_an_artifact_name_cannot_escape_its_job_prefix():
    import pytest

    workspace, job = uuid.uuid4(), uuid.uuid4()

    with pytest.raises(ValueError, match="artifact name"):
        artifact_key(workspace, job, "../../../etc/passwd")
