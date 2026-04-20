from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict


class TargetAdapter(ABC):
    adapter_name: str = "base"

    @abstractmethod
    def build(self, canonical: Dict[str, Any], flow=None) -> Dict[str, Any]:
        """
        Build target payload from canonical document.
        Must return a dict like:
        {
            "content_type": "application/xml",
            "file_extension": "xml",
            "payload": "<xml>...</xml>",
            "meta": {...}
        }
        """
        raise NotImplementedError