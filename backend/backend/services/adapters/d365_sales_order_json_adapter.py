from __future__ import annotations

from typing import Any, Dict

from backend.services.adapters.base_adapter import TargetAdapter
from backend.services.target_mapping_service import (
    mapping_profile_from_flow,
    resolve_header_target_value,
    resolve_line_target_value,
)


class D365SalesOrderJsonAdapter(TargetAdapter):
    adapter_name = "d365_sales_order_json"

    def build(self, canonical: Dict[str, Any], flow=None) -> Dict[str, Any]:
        header = canonical.get("header", {})
        parties = canonical.get("parties", {})
        items = canonical.get("items", [])
        mapping_profile = mapping_profile_from_flow(flow)

        buyer = parties.get("buyer") or {}
        ship_to = parties.get("ship_to") or {}

        payload = {
            "salesOrderNumber": resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="sales_order_number", default=header.get("document_number") or header.get("po_number")),
            "salesOrderDate": resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="document_date", default=header.get("document_date") or header.get("po_date")),
            "currencyCode": resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="currency_code", default=header.get("currency_code") or header.get("currency")),
            "customerAccount": resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="customer_account", default=buyer.get("partner_code")),
            "customerName": resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="customer_name", default=buyer.get("partner_name")),
            "deliveryAccount": resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="delivery_account", default=ship_to.get("partner_code")),
            "deliveryName": resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="delivery_name", default=ship_to.get("partner_name")),
            "orderType": resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="order_type", default=header.get("buyer_order_type") or header.get("seller_order_type")),
            "lines": [],
        }

        for idx, item in enumerate(items, start=1):
            line = {
                "lineNumber": item.get("line_number") or idx,
                "itemNumber": item.get("internal_material_code")
                or item.get("supplier_product_code")
                or item.get("buyer_product_code"),
                "externalItemNumber": item.get("buyer_product_code"),
                "vendorItemNumber": item.get("supplier_product_code"),
                "description": item.get("description"),
                "orderedQuantity": item.get("ordered_quantity", item.get("quantity")),
                "orderUnitSymbol": item.get("ordered_uom", item.get("uom")),
                "unitPrice": item.get("unit_price"),
                "requestedDeliveryDate": item.get("requested_delivery_date") or item.get("delivery_date"),
                "currencyCode": item.get("currency_code") or header.get("currency_code") or header.get("currency"),
            }

            line["lineNumber"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="line_number", default=line["lineNumber"])
            line["itemNumber"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="item_number", default=line["itemNumber"])
            line["externalItemNumber"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="buyer_product_code", default=line["externalItemNumber"])
            line["vendorItemNumber"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="supplier_product_code", default=line["vendorItemNumber"])
            line["description"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="description", default=line["description"])
            line["orderedQuantity"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="ordered_quantity", default=line["orderedQuantity"])
            line["orderUnitSymbol"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="ordered_uom", default=line["orderUnitSymbol"])
            line["unitPrice"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="unit_price", default=line["unitPrice"])
            line["requestedDeliveryDate"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="requested_delivery_date", default=line["requestedDeliveryDate"])
            line["currencyCode"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="currency_code", default=line["currencyCode"])

            payload["lines"].append(
                line
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
