from __future__ import annotations

from typing import Any, Dict

from backend.services.parsers.base import SourceParser


class ExcelParser(SourceParser):
    parser_name = "excel"

    def parse(self, message: Dict[str, Any], profile: dict | None = None) -> Dict[str, Any]:
        """
        Assumes upstream already extracted rows or columns.
        """
        header = message.get("header") or {}
        rows = message.get("items") or message.get("rows") or []

        return {
            "raw_text": message.get("raw_text") or "",
            "header": header,
            "items": [
                {
                    "line_no": row.get("line_no") or row.get("line_number"),
                    "material_code": row.get("material_code"),
                    "buyer_product_code": row.get("buyer_product_code"),
                    "supplier_product_code": row.get("supplier_product_code"),
                    "description": row.get("description"),
                    "quantity": row.get("quantity"),
                    "uom": row.get("uom"),
                    "unit_price": row.get("unit_price"),
                    "amount": row.get("amount"),
                    "delivery_date": row.get("delivery_date"),
                    "plant": row.get("plant"),
                }
                for row in rows
            ],
            "meta": {
                "parser": self.parser_name,
                "source_format": "EXCEL",
            },
        }