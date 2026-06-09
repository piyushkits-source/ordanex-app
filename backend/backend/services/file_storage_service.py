import hashlib
import mimetypes
import os
import re
import uuid
from pathlib import Path

try:
    import boto3
except Exception:  # pragma: no cover - local fallback when boto3 is not installed yet
    boto3 = None


UPLOAD_ROOT = Path("data/uploads")


def _safe_path_segment(value: str | None, fallback: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "-", str(value or "").strip()).strip("-")
    return cleaned or fallback


def _storage_provider() -> str:
    return str(os.getenv("FILE_STORAGE_PROVIDER", "local") or "local").strip().lower()


def _s3_bucket() -> str:
    return str(os.getenv("AWS_S3_UPLOAD_BUCKET", "") or "").strip()


def _s3_prefix() -> str:
    return _safe_path_segment(os.getenv("AWS_S3_UPLOAD_PREFIX", "ordanex"), "ordanex")


def _s3_region() -> str | None:
    return (
        str(os.getenv("AWS_REGION", "") or "").strip()
        or str(os.getenv("AWS_DEFAULT_REGION", "") or "").strip()
        or None
    )


def _s3_endpoint_url() -> str | None:
    value = str(os.getenv("AWS_S3_ENDPOINT_URL", "") or "").strip()
    return value or None


def _s3_client():
    if boto3 is None:
        raise RuntimeError(
            "boto3 is not installed. Add boto3 to the backend requirements for S3-backed file storage."
        )
    kwargs = {}
    if _s3_region():
        kwargs["region_name"] = _s3_region()
    if _s3_endpoint_url():
        kwargs["endpoint_url"] = _s3_endpoint_url()
    return boto3.client("s3", **kwargs)


def _guess_content_type(original_file_name: str) -> str:
    content_type, _ = mimetypes.guess_type(original_file_name)
    return content_type or "application/octet-stream"


def ensure_upload_dir(client_id: str, subdir: str | None = None) -> Path:
    path = UPLOAD_ROOT / _safe_path_segment(client_id, "unknown-client")
    if subdir:
        for raw_part in str(subdir).replace("\\", "/").split("/"):
            part = _safe_path_segment(raw_part, "")
            if part:
                path = path / part
    path.mkdir(parents=True, exist_ok=True)
    return path


def _build_s3_key(client_id: str, original_file_name: str, subdir: str | None = None) -> str:
    ext = Path(original_file_name).suffix.lower()
    key_parts = [_s3_prefix(), _safe_path_segment(client_id, "unknown-client")]
    if subdir:
        for raw_part in str(subdir).replace("\\", "/").split("/"):
            part = _safe_path_segment(raw_part, "")
            if part:
                key_parts.append(part)
    key_parts.append(f"{uuid.uuid4()}{ext}")
    return "/".join(key_parts)


def is_s3_storage_path(file_path: str | None) -> bool:
    return str(file_path or "").strip().lower().startswith("s3://")


def split_s3_storage_path(file_path: str) -> tuple[str, str]:
    normalized = str(file_path or "").strip()
    if not normalized.lower().startswith("s3://"):
        raise ValueError(f"Not an S3 storage path: {file_path}")
    without_scheme = normalized[5:]
    bucket, _, key = without_scheme.partition("/")
    if not bucket or not key:
        raise ValueError(f"Malformed S3 storage path: {file_path}")
    return bucket, key


def resolve_local_file_path(file_path: str | None) -> Path:
    normalized = str(file_path or "").strip().replace("\\", "/")
    abs_path = Path(normalized)
    if not abs_path.is_absolute():
        abs_path = Path.cwd() / abs_path
    return abs_path.resolve()


def read_stored_file(file_path: str) -> bytes:
    if is_s3_storage_path(file_path):
        bucket, key = split_s3_storage_path(file_path)
        obj = _s3_client().get_object(Bucket=bucket, Key=key)
        return obj["Body"].read()

    abs_path = resolve_local_file_path(file_path)
    if not abs_path.exists():
        raise FileNotFoundError(str(abs_path))
    return abs_path.read_bytes()


def save_uploaded_file(
    client_id: str,
    original_file_name: str,
    file_bytes: bytes,
    subdir: str | None = None,
) -> dict:
    checksum = hashlib.sha256(file_bytes).hexdigest()

    if _storage_provider() == "s3":
        bucket = _s3_bucket()
        if not bucket:
            raise RuntimeError(
                "FILE_STORAGE_PROVIDER is set to 's3' but AWS_S3_UPLOAD_BUCKET is empty."
            )
        storage_key = _build_s3_key(client_id, original_file_name, subdir=subdir)
        _s3_client().put_object(
            Bucket=bucket,
            Key=storage_key,
            Body=file_bytes,
            ContentType=_guess_content_type(original_file_name),
        )
        return {
            "file_path": f"s3://{bucket}/{storage_key}",
            "file_size_bytes": len(file_bytes),
            "checksum": checksum,
            "storage_key": storage_key,
            "storage_provider": "s3",
        }

    client_dir = ensure_upload_dir(client_id, subdir=subdir)
    ext = Path(original_file_name).suffix.lower()
    stored_name = f"{uuid.uuid4()}{ext}"
    full_path = client_dir / stored_name
    with open(full_path, "wb") as file_handle:
        file_handle.write(file_bytes)
    try:
        storage_key = str(full_path.relative_to(UPLOAD_ROOT)).replace("\\", "/")
    except Exception:
        storage_key = str(full_path).replace("\\", "/")
    return {
        "file_path": str(full_path),
        "file_size_bytes": len(file_bytes),
        "checksum": checksum,
        "storage_key": storage_key,
        "storage_provider": "local",
    }
