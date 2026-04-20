from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any
import json

import requests


def _safe_str(v: Any) -> str:
    return "" if v is None else str(v).strip()


def _timestamp() -> str:
    return datetime.utcnow().strftime("%Y%m%d_%H%M%S")


def _ensure_dir(path: str):
    Path(path).mkdir(parents=True, exist_ok=True)


def deliver_via_file(payload: str, mime_type: str, config: dict, file_stem: str) -> dict:
    out_dir = config.get("path") or "output"
    _ensure_dir(out_dir)

    ext = "txt"
    if mime_type == "application/json":
        ext = "json"
    elif mime_type == "application/xml":
        ext = "xml"
    elif mime_type == "text/csv":
        ext = "csv"

    full_path = Path(out_dir) / f"{file_stem}_{_timestamp()}.{ext}"
    full_path.write_text(payload, encoding="utf-8")

    return {
        "success": True,
        "channel": "file",
        "target": str(out_dir),
        "output_file": str(full_path),
        "status_code": 200,
        "response_payload": json.dumps({"written": True}),
    }


def deliver_via_api(payload: str, mime_type: str, config: dict) -> dict:
    endpoint = _safe_str(config.get("endpoint") or config.get("url"))
    if not endpoint:
        raise ValueError("API endpoint missing")

    headers = {"Content-Type": mime_type}
    auth_type = _safe_str(config.get("auth_type")).lower()

    kwargs = {
        "headers": headers,
        "data": payload.encode("utf-8"),
        "timeout": int(config.get("timeout_seconds", 120)),
    }

    if auth_type == "basic":
        kwargs["auth"] = (_safe_str(config.get("username")), _safe_str(config.get("password")))
    elif auth_type == "bearer" and _safe_str(config.get("token")):
        headers["Authorization"] = f"Bearer {_safe_str(config.get('token'))}"

    resp = requests.post(endpoint, **kwargs)

    return {
        "success": 200 <= resp.status_code < 300,
        "channel": "api",
        "target": endpoint,
        "status_code": resp.status_code,
        "response_payload": resp.text,
    }


def deliver_via_sftp(payload: str, mime_type: str, config: dict, file_stem: str) -> dict:
    # safe stub for now; replace with paramiko-based implementation later
    fallback_dir = config.get("path") or "output/sftp_stub"
    _ensure_dir(fallback_dir)

    ext = "txt"
    if mime_type == "application/json":
        ext = "json"
    elif mime_type == "application/xml":
        ext = "xml"
    elif mime_type == "text/csv":
        ext = "csv"

    full_path = Path(fallback_dir) / f"{file_stem}_{_timestamp()}.{ext}"
    full_path.write_text(payload, encoding="utf-8")

    return {
        "success": True,
        "channel": "sftp_stub",
        "target": _safe_str(config.get("host")) or "sftp_stub",
        "output_file": str(full_path),
        "status_code": 200,
        "response_payload": json.dumps({"staged_locally": True}),
    }


CHANNEL_REGISTRY = {
    "file": deliver_via_file,
    "api": deliver_via_api,
    "sftp": deliver_via_sftp,
}
