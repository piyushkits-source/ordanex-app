from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from backend.services.connectors.base import TargetConnector


class FileConnector(TargetConnector):
    connector_name = "file"

    def send(
        self,
        *,
        payload: Any,
        content_type: str,
        file_extension: str,
        connection: Dict[str, Any],
        filename: str | None = None,
    ) -> Dict[str, Any]:
        target_dir = connection.get("target_directory") or connection.get("folder_path")
        if not target_dir:
            raise ValueError("File connector requires 'target_directory' or 'folder_path'.")

        Path(target_dir).mkdir(parents=True, exist_ok=True)

        safe_filename = filename or f"message_output.{file_extension}"
        full_path = Path(target_dir) / safe_filename

        if isinstance(payload, dict):
            content = json.dumps(payload, indent=2, ensure_ascii=False)
        else:
            content = str(payload)

        full_path.write_text(content, encoding="utf-8")

        return {
            "status": "SUCCESS",
            "connector": self.connector_name,
            "location": str(full_path),
            "filename": safe_filename,
        }