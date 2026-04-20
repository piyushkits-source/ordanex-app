from __future__ import annotations

from typing import Any, Dict

from backend.services.adapters.base_adapter import TargetAdapter


class D365SalesOrderJsonAdapter(TargetAdapter):
    adapter_name = "d365_sales_order_json"

    def build(self, canonical: Dict[str, Any], flow=None) -> Dict[str, Any]:
        header = canonical.get("header", {})
        parties = canonical.get("parties", {})
        items = canonical.get("items", [])

        payload = {
            "salesOrderNumber": header.get("po_number"),
            "salesOrderDate": header.get("po_date"),
            "currencyCode": header.get("currency"),
            "customerAccount": (parties.get("sold_to") or {}).get("code"),
            "deliveryAccount": (parties.get("ship_to") or {}).get("code"),
            "lines": [],
        }

        for idx, item in enumerate(items, start=1):
            payload["lines"].append(
                {
                    "lineNumber": idx,
                    "itemNumber": item.get("internal_material_code")
                    or item.get("supplier_product_code")
                    or item.get("buyer_product_code"),
                    "externalItemNumber": item.get("buyer_product_code"),
                    "vendorItemNumber": item.get("supplier_product_code"),
                    "description": item.get("description"),
                    "orderedQuantity": item.get("quantity"),
                    "orderUnitSymbol": item.get("uom"),
                    "unitPrice": item.get("unit_price"),
                }
            )

        return {
            "content_type": "application/json",
            "file_extension": "json",
            "payload": payload,
            "meta": {
                "erp": "D365",
                "message_type": "SalesOrder",
                "message_version": "v1",
                "adapter": self.adapter_name,
            },
        }