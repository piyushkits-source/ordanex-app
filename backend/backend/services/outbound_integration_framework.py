from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.services.canonical_order_model import build_canonical_order
from backend.services.target_adapters import ADAPTER_REGISTRY
from backend.services.delivery_channels import CHANNEL_REGISTRY


def _safe_dict(v: Any) -> dict:
    return v if isinstance(v, dict) else {}


def _safe_str(v: Any) -> str:
    return "" if v is None else str(v).strip()


def build_outbound_result(
    *,
    success: bool,
    adapter_type: str,
    delivery_channel: str,
    message: str,
    mime_type: str | None = None,
    payload_preview: str | None = None,
    delivery_result: dict | None = None,
) -> dict:
    return {
        "success": success,
        "adapter_type": adapter_type,
        "delivery_channel": delivery_channel,
        "message": message,
        "mime_type": mime_type,
        "payload_preview": payload_preview,
        "delivery_result": delivery_result or {},
        "executed_at": datetime.utcnow().isoformat(),
    }


def run_outbound_integration(
    *,
    header: dict,
    items: list[dict],
    integration_cfg: dict,
) -> dict:
    integration_cfg = _safe_dict(integration_cfg)

    target_system = _safe_str(integration_cfg.get("target_system"))
    adapter_type = _safe_str(integration_cfg.get("adapter_type") or "generic_json")
    delivery_channel = _safe_str(integration_cfg.get("delivery_channel") or "file").lower()

    adapter_fn = ADAPTER_REGISTRY.get(adapter_type)
    if not adapter_fn:
        raise ValueError(f"Unsupported adapter_type: {adapter_type}")

    channel_fn = CHANNEL_REGISTRY.get(delivery_channel)
    if not channel_fn:
        raise ValueError(f"Unsupported delivery_channel: {delivery_channel}")

    canonical_order = build_canonical_order(header, items)

    mime_type, adapted_payload = adapter_fn(canonical_order, integration_cfg)

    po_number = ((canonical_order.get("order_header") or {}).get("po_number")) or "po"
    delivery_result = channel_fn(
        adapted_payload,
        mime_type,
        integration_cfg,
        po_number,
    ) if delivery_channel in {"file", "sftp"} else channel_fn(
        adapted_payload,
        mime_type,
        integration_cfg,
    )

    success = bool(delivery_result.get("success"))

    return build_outbound_result(
        success=success,
        adapter_type=adapter_type,
        delivery_channel=delivery_channel,
        message=f"Outbound integration {'successful' if success else 'failed'} for {target_system or 'target system'}",
        mime_type=mime_type,
        payload_preview=adapted_payload[:4000] if adapted_payload else None,
        delivery_result=delivery_result,
    )
