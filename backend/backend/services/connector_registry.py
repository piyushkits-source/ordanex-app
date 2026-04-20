
from __future__ import annotations

from backend.services.connectors.api_connector import ApiConnector
from backend.services.connectors.file_connector import FileConnector
from backend.services.connectors.sftp_connector import SftpConnector


def get_connector(connection_type: str | None):
    normalized = (connection_type or "").strip().upper()

    if normalized in {"SFTP"}:
        return SftpConnector()

    if normalized in {"API", "REST", "HTTP"}:
        return ApiConnector()

    if normalized in {"FILE", "LOCAL_FILE", "FOLDER"}:
        return FileConnector()

    raise ValueError(f"Unsupported connection type: {connection_type}")
