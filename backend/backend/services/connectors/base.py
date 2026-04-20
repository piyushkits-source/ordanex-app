from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict


class TargetConnector(ABC):
    connector_name: str = "base"

    @abstractmethod
    def send(
        self,
        *,
        payload: Any,
        content_type: str,
        file_extension: str,
        connection: Dict[str, Any],
        filename: str | None = None,
    ) -> Dict[str, Any]:
        """
        Send payload to target connection.
        Returns a delivery result dict.
        """
        raise NotImplementedError

