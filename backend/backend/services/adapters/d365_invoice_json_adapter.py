from __future__ import annotations

from typing import Any, Dict

from backend.services.adapters.base_adapter import TargetAdapter


class D365InvoiceJsonAdapter(TargetAdapter):
    adapter_name = "d365_invoice_json"

    def build(self, canonical: Dict[str, Any], flow=None) -> Dict[str, Any]:
        header = canonical.get("header", {})
        parties = canonical.get("parties", {})
        items = canonical.get("items", [])

        buyer = parties.get("buyer") or parties.get("sold_to") or {}
        seller = parties.get("seller") or parties.get("supplier") or {}
        ship_to = parties.get("ship_to") or {}

        payload = {
            "invoiceNumber": header.get("document_number"),
            "invoiceDate": header.get("document_date"),
            "currencyCode": header.get("currency_code"),
            "customerAccount": buyer.get("partner_code"),
            "supplierAccount": seller.get("partner_code"),
            "deliveryAccount": ship_to.get("partner_code"),
            "lines": [],
        }

        for idx, item in enumerate(items, start=1):
            payload["lines"].append(
                {
                    "lineNumber": idx,
                    "itemNumber": item.get("internal_material_code")
                    or item.get("supplier_product_code")
                    or item.get("buyer_product_code"),
                    "description": item.get("description"),
                    "quantity": item.get("normalized_quantity") or item.get("ordered_quantity") or item.get("quantity"),
                    "uom": item.get("normalized_uom") or item.get("ordered_uom") or item.get("uom"),
                    "unitPrice": item.get("unit_price"),
                    "amount": item.get("amount"),
                    "deliveryDate": item.get("requested_delivery_date"),
                }
            )

        return {
            "content_type": "application/json",
            "file_extension": "json",
            "payload": payload,
            "meta": {
                "erp": "D365",
                "message_type": "INVOICE",
                "message_version": "v1",
                "adapter": self.adapter_name,
            },
        }
