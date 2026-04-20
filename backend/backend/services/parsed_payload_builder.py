from __future__ import annotations

from typing import Any, Dict


def build_parsed_payload_from_po(po) -> Dict[str, Any]:
    return {
        "raw_text": po.raw_text,
        "header": po.header_details or {},
        "items": [
            {
                "line_no": item.line_no,
                "material_code": item.material_code,
                "buyer_product_code": getattr(item, "buyer_product_code", None),
                "supplier_product_code": getattr(item, "supplier_product_code", None),
                "description": item.description,
                "quantity": item.quantity,
                "uom": item.uom,
                "unit_price": item.unit_price,
                "amount": item.amount,
                "delivery_date": str(item.delivery_date) if item.delivery_date else None,
                "plant": item.plant,
            }
            for item in po.items
        ],
        "meta": {
            "source_format": "DB_PO",
            "parser": "db_bridge",
        },
    }