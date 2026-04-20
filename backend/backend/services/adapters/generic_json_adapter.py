from __future__ import annotations

from typing import Any, Dict

from backend.services.adapters.base_adapter import TargetAdapter


class GenericJsonAdapter(TargetAdapter):
    adapter_name = "generic_json"

    def build(self, canonical: Dict[str, Any], flow=None) -> Dict[str, Any]:
        return {
            "content_type": "application/json",
            "file_extension": "json",
            "payload": canonical,
            "meta": {
                "erp": "GENERIC",
                "message_type": (flow.target_message_type if flow else None),
                "message_version": (flow.target_message_version if flow else None),
                "adapter": self.adapter_name,
            },
        }