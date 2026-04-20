
from typing import Any

def build_som(parsed_data: dict | None) -> dict:
    parsed_data = parsed_data or {}
    header = dict(parsed_data.get("header") or {})
    items = list(parsed_data.get("items") or [])

    return {
        "header": header,
        "items": items,
    }

def build_som_from_po(po: Any) -> dict:
    return {
        "order_header": {
            "po_number": po.po_number,
            "po_date": str(po.po_date) if po.po_date else None,
            "currency": po.currency,
            "sold_to": po.sold_to,
            "ship_to": po.ship_to,
        },
        "items": [
            {
                "line_no": i.line_no,
                "material_code": i.material_code,
                "description": i.description,
                "quantity": i.quantity,
                "uom": i.uom,
                "unit_price": i.unit_price,
                "amount": i.amount,
            }
            for i in po.items
        ],
    }
