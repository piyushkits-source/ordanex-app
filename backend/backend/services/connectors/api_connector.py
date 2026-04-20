from __future__ import annotations

import json
from typing import Any, Dict

import requests

from backend.services.connectors.base import TargetConnector


class ApiConnector(TargetConnector):
    connector_name = "api"

    def send(
        self,
        *,
        payload: Any,
        content_type: str,
        file_extension: str,
        connection: Dict[str, Any],
        filename: str | None = None,
    ) -> Dict[str, Any]:
        url = connection.get("endpoint_url")
        if not url:
            raise ValueError("API connector requires 'endpoint_url'.")

        method = str(connection.get("http_method") or "POST").upper()
        timeout = int(connection.get("timeout_seconds") or 60)

        headers = dict(connection.get("headers") or {})
        auth_type = str(connection.get("auth_type") or "").upper()

        if auth_type == "BASIC":
            username = connection.get("username") or ""
            password = connection.get("password") or ""
            auth = (username, password)
        else:
            auth = None

        if auth_type == "BEARER":
            token = connection.get("token") or ""
            if token:
                headers["Authorization"] = f"Bearer {token}"

        if isinstance(payload, dict):
            body = json.dumps(payload)
        else:
            body = str(payload)

        headers.setdefault("Content-Type", content_type)

        response = requests.request(
            method=method,
            url=url,
            data=body.encode("utf-8"),
            headers=headers,
            auth=auth,
            timeout=timeout,
        )

        return {
            "status": "SUCCESS" if response.ok else "FAILED",
            "connector": self.connector_name,
            "http_status": response.status_code,
            "response_text": response.text[:4000],
            "url": url,
        }