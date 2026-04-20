from __future__ import annotations

from typing import Any, Dict

from backend.services.parsers.base import SourceParser


class JsonParser(SourceParser):
    parser_name = "json"

    def parse(self, message: Dict[str, Any], profile: dict | None = None) -> Dict[str, Any]:
        header = message.get("header") or {}
        items = message.get("items") or []

        return {
            "raw_text": message.get("raw_text") or "",
            "header": {
                "po_number": header.get("po_number"),
                "po_date": header.get("po_date"),
                "currency": header.get("currency"),
                "sold_to": header.get("sold_to"),
                "ship_to": header.get("ship_to"),
                **header,
            },
            "items": [
                {
                    "line_no": item.get("line_no") or item.get("line_number"),
                    "material_code": item.get("material_code"),
                    "buyer_product_code": item.get("buyer_product_code"),
                    "supplier_product_code": item.get("supplier_product_code"),
                    "description": item.get("description"),
                    "quantity": item.get("quantity"),
                    "uom": item.get("uom"),
                    "unit_price": item.get("unit_price"),
                    "amount": item.get("amount"),
                    "delivery_date": item.get("delivery_date"),
                    "plant": item.get("plant"),
                }
                for item in items
            ],
            "meta": {
                "parser": self.parser_name,
                "source_format": "JSON",
            },
        }
