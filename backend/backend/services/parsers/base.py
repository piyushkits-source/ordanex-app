from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict


class SourceParser(ABC):
    parser_name: str = "base"

    @abstractmethod
    def parse(self, message: Dict[str, Any], profile: dict | None = None) -> Dict[str, Any]:
        """
        Must return normalized parsed payload:
        {
            "raw_text": "...",
            "header": {...},
            "items": [...],
            "meta": {...}
        }
        """
        raise NotImplementedError