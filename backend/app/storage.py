from uuid import uuid4

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.config import settings

s3 = boto3.client(
    "s3",
    endpoint_url=settings.s3_endpoint,
    aws_access_key_id=settings.s3_access_key,
    aws_secret_access_key=settings.s3_secret_key,
    region_name=settings.s3_region,
    config=Config(signature_version="s3v4"),
)


def ensure_bucket() -> None:
    try:
        s3.head_bucket(Bucket=settings.s3_bucket)
    except ClientError:
        s3.create_bucket(Bucket=settings.s3_bucket)


def upload_bytes(data: bytes, original_name: str, folder: str) -> str:
    key = f"{folder}/{uuid4().hex}_{original_name}"
    s3.put_object(Bucket=settings.s3_bucket, Key=key, Body=data)
    return key


def read_text_object(key: str) -> str:
    obj = s3.get_object(Bucket=settings.s3_bucket, Key=key)
    return obj["Body"].read().decode("utf-8", errors="ignore")


def read_bytes_object(key: str) -> bytes:
    obj = s3.get_object(Bucket=settings.s3_bucket, Key=key)
    return obj["Body"].read()


def delete_object_s3(key: str) -> None:
    if not key:
        return
    try:
        s3.delete_object(Bucket=settings.s3_bucket, Key=key)
    except ClientError:
        pass
