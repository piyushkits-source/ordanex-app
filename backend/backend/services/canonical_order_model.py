from __future__ import annotations

from copy import deepcopy
from typing import Any


def _safe_str(v: Any) -> str:
    return "" if v is None else str(v).strip()


def _safe_float(v: Any):
    try:
        if v in (None, ""):
            return None
        return float(v)
    except Exception:
        return None


def build_canonical_order(header: dict, items: list[dict]) -> dict:
    header = header or {}
    items = items or []

    canonical_items = []
    for idx, item in enumerate(items, start=1):
        canonical_items.append(
            {
                "line_no": item.get("line_no", idx),
                "material_code": _safe_str(item.get("material_code") or item.get("material")),
                "description": _safe_str(item.get("description")),
                "quantity": _safe_float(item.get("quantity")),
                "uom": _safe_str(item.get("uom")),
                "unit_price": _safe_float(item.get("unit_price")),
                "amount": _safe_float(item.get("amount")),
                "delivery_date": _safe_str(item.get("delivery_date")),
                "plant": _safe_str(item.get("plant")),
                "customer_material": _safe_str(item.get("customer_material")),
                "supplier_material": _safe_str(item.get("supplier_material")),
                "manufacturer_material": _safe_str(item.get("manufacturer_material")),
            }
        )

    return {
        "order_header": {
            "po_number": _safe_str(header.get("po_number")),
            "po_date": _safe_str(header.get("po_date")),
            "currency": _safe_str(header.get("currency")),
            "supplier_name": _safe_str(header.get("supplier_name")),
            "sold_to": _safe_str(header.get("sold_to")),
            "ship_to": _safe_str(header.get("ship_to")),
            "po_type": _safe_str(header.get("po_type")),
            "order_type": _safe_str(header.get("order_type")),
            "sender": _safe_str(header.get("sender")),
            "receiver": _safe_str(header.get("receiver")),
            "client_id": _safe_str(header.get("client_id")),
        },
        "order_items": canonical_items,
        "meta": {
            "source_format": _safe_str(header.get("source_format")),
            "source_file_name": _safe_str(header.get("source_file_name")),
        },
    }
