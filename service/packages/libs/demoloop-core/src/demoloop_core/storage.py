import re
import uuid
from functools import lru_cache

import boto3
from botocore.client import Config

from demoloop_core.settings import settings

SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


@lru_cache
def client():
    return boto3.client(
        "s3",
        endpoint_url=settings().storage_endpoint,
        aws_access_key_id=settings().storage_access_key,
        aws_secret_access_key=settings().storage_secret_key,
        config=Config(signature_version="s3v4"),
        region_name=settings().storage_region,
    )


def ensure_bucket() -> None:
    bucket = settings().storage_bucket
    if bucket not in {entry["Name"] for entry in client().list_buckets()["Buckets"]}:
        client().create_bucket(Bucket=bucket)


def artifact_key(workspace_id: uuid.UUID, job_id: uuid.UUID, name: str) -> str:
    if not SAFE_NAME.match(name):
        raise ValueError(f"artifact name is not storable: {name!r}")
    return f"workspace/{workspace_id}/production/{job_id}/{name}"


def presign_put(key: str, seconds: int = 900) -> str:
    return client().generate_presigned_url(
        "put_object", Params={"Bucket": settings().storage_bucket, "Key": key}, ExpiresIn=seconds
    )


def presign_get(key: str, seconds: int = 900) -> str:
    return client().generate_presigned_url(
        "get_object", Params={"Bucket": settings().storage_bucket, "Key": key}, ExpiresIn=seconds
    )
