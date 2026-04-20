from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

import requests


def _norm(v: Any) -> str:
    return str(v or "").strip()


def _safe_dict(v: Any) -> dict:
    return v if isinstance(v, dict) else {}


def _timestamp() -> str:
    return datetime.utcnow().strftime("%Y%m%d_%H%M%S")


def _ensure_dir(path: str | Path):
    Path(path).mkdir(parents=True, exist_ok=True)


def build_release_result(
    *,
    success: bool,
    mode: str,
    message: str,
    request_payload: str | None = None,
    response_payload: str | None = None,
    status_code: int | None = None,
    target: str | None = None,
    output_file: str | None = None,
) -> dict:
    return {
        "success": success,
        "mode": mode,
        "message": message,
        "request_payload": request_payload,
        "response_payload": response_payload,
        "status_code": status_code,
        "target": target,
        "output_file": output_file,
        "released_at": datetime.utcnow().isoformat(),
    }


def release_mock(*, po_number: str, xml_payload: str, sap_cfg: dict) -> dict:
    return build_release_result(
        success=True,
        mode="mock",
        message=f"Mock release successful for PO {po_number}",
        request_payload=xml_payload,
        response_payload=json.dumps({"mock": True, "po_number": po_number}),
        status_code=200,
        target="mock://sap",
    )


def release_to_file(*, po_number: str, xml_payload: str, outbound_cfg: dict) -> dict:
    output_dir = outbound_cfg.get("path") or "output"
    _ensure_dir(output_dir)

    filename = f"{po_number or 'po'}_{_timestamp()}.xml"
    full_path = Path(output_dir) / filename
    full_path.write_text(xml_payload, encoding="utf-8")

    return build_release_result(
        success=True,
        mode="file",
        message=f"XML written to file system for PO {po_number}",
        request_payload=xml_payload,
        response_payload=json.dumps({"written": True}),
        status_code=200,
        target=str(output_dir),
        output_file=str(full_path),
    )


def release_to_api(*, po_number: str, xml_payload: str, sap_cfg: dict, timeout: int = 120) -> dict:
    target_url = _norm(sap_cfg.get("sap_url") or sap_cfg.get("url") or sap_cfg.get("endpoint"))
    if not target_url:
        raise ValueError("SAP API target URL is missing in SAP config")

    auth_type = _norm(sap_cfg.get("auth_type")).lower()
    headers = {
        "Content-Type": "application/xml",
    }

    request_kwargs: dict[str, Any] = {
        "headers": headers,
        "data": xml_payload.encode("utf-8"),
        "timeout": timeout,
    }

    if auth_type == "basic":
        user = _norm(sap_cfg.get("username") or sap_cfg.get("user"))
        password = _norm(sap_cfg.get("password"))
        request_kwargs["auth"] = (user, password)

    elif auth_type == "bearer":
        token = _norm(sap_cfg.get("token"))
        if token:
            headers["Authorization"] = f"Bearer {token}"

    resp = requests.post(target_url, **request_kwargs)

    return build_release_result(
        success=200 <= resp.status_code < 300,
        mode="api",
        message=f"API release {'successful' if 200 <= resp.status_code < 300 else 'failed'} for PO {po_number}",
        request_payload=xml_payload,
        response_payload=resp.text,
        status_code=resp.status_code,
        target=target_url,
    )


def release_to_sftp(*, po_number: str, xml_payload: str, outbound_cfg: dict) -> dict:
    """
    Placeholder-safe implementation.
    If paramiko is available in your environment, you can replace this stub with actual SFTP send.
    For now, writes to configured local fallback path and returns mode=sftp_stub.
    """
    sftp_cfg = _safe_dict(outbound_cfg.get("sftp"))
    fallback_dir = outbound_cfg.get("path") or "output/sftp_stub"
    _ensure_dir(fallback_dir)

    filename = f"{po_number or 'po'}_{_timestamp()}.xml"
    full_path = Path(fallback_dir) / filename
    full_path.write_text(xml_payload, encoding="utf-8")

    host = _norm(sftp_cfg.get("host"))
    target = host or "sftp_stub"

    return build_release_result(
        success=True,
        mode="sftp_stub",
        message=f"SFTP stub release completed for PO {po_number}. File staged locally.",
        request_payload=xml_payload,
        response_payload=json.dumps({"staged_locally": True}),
        status_code=200,
        target=target,
        output_file=str(full_path),
    )


def release_to_sap(
    *,
    po_number: str,
    xml_payload: str,
    sap_cfg: dict | None = None,
    outbound_cfg: dict | None = None,
) -> dict:
    sap_cfg = _safe_dict(sap_cfg)
    outbound_cfg = _safe_dict(outbound_cfg)

    if not xml_payload:
        raise ValueError("XML payload is empty")

    mock_mode = bool(sap_cfg.get("mock_mode", False))
    if mock_mode:
        return release_mock(po_number=po_number, xml_payload=xml_payload, sap_cfg=sap_cfg)

    outbound_type = _norm(outbound_cfg.get("type") or "file").lower()

    if outbound_type == "file":
        return release_to_file(po_number=po_number, xml_payload=xml_payload, outbound_cfg=outbound_cfg)

    if outbound_type == "api":
        return release_to_api(po_number=po_number, xml_payload=xml_payload, sap_cfg=sap_cfg)

    if outbound_type == "sftp":
        return release_to_sftp(po_number=po_number, xml_payload=xml_payload, outbound_cfg=outbound_cfg)

    raise ValueError(f"Unsupported outbound type: {outbound_type}")
