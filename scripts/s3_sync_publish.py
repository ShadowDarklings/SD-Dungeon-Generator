#!/usr/bin/env python3
"""Upload S3_content/ to the team S3 static website bucket."""

from __future__ import annotations

import mimetypes
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError, NoCredentialsError

BUCKET = "charlesreeder-506-hw1"
CONTENT_DIR = Path(__file__).resolve().parents[1] / "S3_content"


def guess_type(path: Path) -> str:
    content_type, _ = mimetypes.guess_type(path.name)
    return content_type or "application/octet-stream"


def main() -> int:
    if not CONTENT_DIR.is_dir():
        print(f"Missing content dir: {CONTENT_DIR}", file=sys.stderr)
        return 1

    try:
        s3 = boto3.client("s3", region_name="us-west-2")
        sts = boto3.client("sts", region_name="us-west-2")
        print("Caller:", sts.get_caller_identity())
    except NoCredentialsError:
        print("No AWS credentials found.", file=sys.stderr)
        return 1

    uploaded = 0
    for path in sorted(CONTENT_DIR.rglob("*")):
        if not path.is_file():
            continue
        key = path.relative_to(CONTENT_DIR).as_posix()
        extra = {"ContentType": guess_type(path)}
        print(f"upload s3://{BUCKET}/{key}")
        s3.upload_file(str(path), BUCKET, key, ExtraArgs=extra)
        uploaded += 1

    print(f"Done. Uploaded {uploaded} files to s3://{BUCKET}/")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ClientError as exc:
        print(f"AWS error: {exc}", file=sys.stderr)
        raise SystemExit(1)
