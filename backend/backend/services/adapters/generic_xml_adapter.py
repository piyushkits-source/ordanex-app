from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any, Dict
import xml.etree.ElementTree as ET

from backend.services.adapters.base_adapter import TargetAdapter
from backend.services.target_mapping_service import resolve_target_profile


INVOICE_MESSAGE_TYPES = {"INVOICE", "AP_INVOICE", "AR_INVOICE"}


class GenericXmlAdapter(TargetAdapter):
    adapter_name = "generic_xml"

    @staticmethod
    def _safe(value: Any) -> str:
        return "" if value is None else str(value).strip()

    def _append(self, parent: ET.Element, tag: str, value: Any) -> None:
        if isinstance(value, Mapping):
            node = ET.SubElement(parent, tag)
            for key, child_value in value.items():
                self._append(node, str(key), child_value)
            return
        if isinstance(value, list):
            node = ET.SubElement(parent, tag)
            for item in value:
                self._append(node, "Item", item)
            return
        node = ET.SubElement(parent, tag)
        node.text = self._safe(value)

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

        message_type = self._safe(message_type or target_profile.get("target_message_type")).upper()
        root_name = "Invoice" if message_type in INVOICE_MESSAGE_TYPES else "Document"

        root = ET.Element(root_name)
        meta = ET.SubElement(root, "Meta")
        self._append(meta, "GeneratedAt", datetime.utcnow().isoformat())
        self._append(meta, "TargetERP", target_profile.get("target_erp"))
        self._append(meta, "TargetStandard", target_profile.get("target_message_standard"))
        self._append(meta, "TargetType", message_type)
        self._append(meta, "TargetVersion", message_version or target_profile.get("target_message_version"))

        self._append(root, "Header", canonical.get("header", {}) or {})
        self._append(root, "Parties", canonical.get("parties", {}) or {})
        self._append(root, "Items", canonical.get("items", []) or [])

        payload = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" + ET.tostring(root, encoding="unicode")

        return {
            "content_type": "application/xml",
            "file_extension": "xml",
            "payload": payload,
            "meta": {
                "erp": "GENERIC",
                "message_type": message_type or target_profile.get("target_message_type"),
                "message_version": message_version or target_profile.get("target_message_version"),
                "message_family": target_profile.get("target_message_family"),
                "adapter": self.adapter_name,
            },
        }
