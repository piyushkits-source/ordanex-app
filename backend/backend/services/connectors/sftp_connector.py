from __future__ import annotations

import json
import os
import tempfile
from typing import Any, Dict

import paramiko

from backend.services.connectors.base import TargetConnector


class SftpConnector(TargetConnector):
    connector_name = "sftp"

    def send(
        self,
        *,
        payload: Any,
        content_type: str,
        file_extension: str,
        connection: Dict[str, Any],
        filename: str | None = None,
    ) -> Dict[str, Any]:
        host = connection.get("host")
        port = int(connection.get("port") or 22)
        username = connection.get("username")
        password = connection.get("password")
        remote_path = connection.get("remote_path") or connection.get("folder_path") or "/"

        if not host or not username:
            raise ValueError("SFTP connector requires 'host' and 'username'.")

        safe_filename = filename or f"message_output.{file_extension}"

        if isinstance(payload, dict):
            content = json.dumps(payload, indent=2, ensure_ascii=False)
        else:
            content = str(payload)

        temp_file = None
        transport = None
        sftp = None

        try:
            with tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8", suffix=f".{file_extension}") as f:
                f.write(content)
                temp_file = f.name

            transport = paramiko.Transport((host, port))
            transport.connect(username=username, password=password)

            sftp = paramiko.SFTPClient.from_transport(transport)

            remote_file = remote_path.rstrip("/") + "/" + safe_filename
            sftp.put(temp_file, remote_file)

            return {
                "status": "SUCCESS",
                "connector": self.connector_name,
                "remote_file": remote_file,
                "host": host,
            }
        finally:
            if sftp:
                sftp.close()
            if transport:
                transport.close()
            if temp_file and os.path.exists(temp_file):
                os.remove(temp_file)