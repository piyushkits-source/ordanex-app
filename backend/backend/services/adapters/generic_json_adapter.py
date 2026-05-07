from __future__ import annotations

from typing import Any, Dict

from backend.services.adapters.base_adapter import TargetAdapter
from backend.services.target_mapping_service import resolve_target_profile


class GenericJsonAdapter(TargetAdapter):
    adapter_name = "generic_json"

    def build(self, canonical: Dict[str, Any], flow=None) -> Dict[str, Any]:
        target_profile = resolve_target_profile(flow=flow)
        message_type = None
        message_version = None
        if isinstance(flow, dict):
            raw_flow = flow.get("flow")
            message_type = getattr(raw_flow, "target_message_type", None) if raw_flow is not None else None
            message_version = getattr(raw_flow, "target_message_version", None) if raw_flow is not None else None
        else:
            message_type = getattr(flow, "target_message_type", None) if flow else None
            message_version = getattr(flow, "target_message_version", None) if flow else None

        return {
            "content_type": "application/json",
            "file_extension": "json",
            "payload": canonical,
            "meta": {
                "erp": "GENERIC",
                "message_type": message_type or target_profile.get("target_message_type"),
                "message_version": message_version or target_profile.get("target_message_version"),
                "message_family": target_profile.get("target_message_family"),
                "adapter": self.adapter_name,
            },
        }
