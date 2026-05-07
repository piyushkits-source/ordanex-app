from __future__ import annotations

from typing import Any, Dict

from backend.services.adapters.base_adapter import TargetAdapter
from backend.services.target_mapping_service import (
    mapping_profile_from_flow,
    resolve_header_target_value,
    resolve_line_target_value,
)


class JdeSalesOrderJsonAdapter(TargetAdapter):
    adapter_name = "jde_sales_order_json"

    def build(self, canonical: Dict[str, Any], flow=None) -> Dict[str, Any]:
        header = canonical.get("header", {})
        parties = canonical.get("parties", {})
        items = canonical.get("items", [])
        mapping_profile = mapping_profile_from_flow(flow)

        buyer = parties.get("buyer") or {}
        ship_to = parties.get("ship_to") or {}
        seller = parties.get("seller") or {}

        payload = {
            "orderNumber": resolve_header_target_value(
                canonical,
                mapping_profile=mapping_profile,
                target_field="document_number",
                default=header.get("document_number") or header.get("po_number"),
            ),
            "orderDate": resolve_header_target_value(
                canonical,
                mapping_profile=mapping_profile,
                target_field="document_date",
                default=header.get("document_date") or header.get("po_date"),
            ),
            "currencyCode": resolve_header_target_value(
                canonical,
                mapping_profile=mapping_profile,
                target_field="currency_code",
                default=header.get("currency_code") or header.get("currency"),
            ),
            "customerNumber": resolve_header_target_value(
                canonical,
                mapping_profile=mapping_profile,
                target_field="customer_account",
                default=buyer.get("partner_code") or header.get("sold_to") or header.get("sold_to_code"),
            ),
            "customerName": resolve_header_target_value(
                canonical,
                mapping_profile=mapping_profile,
                target_field="customer_name",
                default=buyer.get("partner_name") or buyer.get("partner_code"),
            ),
            "shipToNumber": resolve_header_target_value(
                canonical,
                mapping_profile=mapping_profile,
                target_field="ship_to_code",
                default=ship_to.get("partner_code") or header.get("ship_to"),
            ),
            "shipToName": resolve_header_target_value(
                canonical,
                mapping_profile=mapping_profile,
                target_field="ship_to_name",
                default=ship_to.get("partner_name") or ship_to.get("partner_code"),
            ),
            "soldToNumber": resolve_header_target_value(
                canonical,
                mapping_profile=mapping_profile,
                target_field="sold_to_code",
                default=buyer.get("partner_code") or header.get("sold_to"),
            ),
            "soldToName": resolve_header_target_value(
                canonical,
                mapping_profile=mapping_profile,
                target_field="buyer_name",
                default=buyer.get("partner_name") or buyer.get("partner_code"),
            ),
            "sellerName": resolve_header_target_value(
                canonical,
                mapping_profile=mapping_profile,
                target_field="seller_name",
                default=seller.get("partner_name") or seller.get("partner_code"),
            ),
            "orderType": resolve_header_target_value(
                canonical,
                mapping_profile=mapping_profile,
                target_field="order_type",
                default=header.get("buyer_order_type") or header.get("seller_order_type"),
            ),
            "lines": [],
        }

        for idx, item in enumerate(items, start=1):
            line = {
                "lineNumber": item.get("line_number") or idx,
                "itemNumber": item.get("internal_material_code")
                or item.get("supplier_product_code")
                or item.get("buyer_product_code"),
                "customerItemNumber": item.get("buyer_product_code"),
                "supplierItemNumber": item.get("supplier_product_code"),
                "description": item.get("description"),
                "quantity": item.get("ordered_quantity", item.get("quantity")),
                "uom": item.get("ordered_uom", item.get("uom")),
                "unitPrice": item.get("unit_price"),
                "currencyCode": item.get("currency_code") or header.get("currency_code") or header.get("currency"),
                "requestedDeliveryDate": item.get("requested_delivery_date") or item.get("delivery_date"),
                "plantCode": item.get("plant_code"),
            }

            line["lineNumber"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="line_number", default=line["lineNumber"])
            line["itemNumber"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="item_number", default=line["itemNumber"])
            line["customerItemNumber"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="buyer_product_code", default=line["customerItemNumber"])
            line["supplierItemNumber"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="supplier_product_code", default=line["supplierItemNumber"])
            line["description"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="description", default=line["description"])
            line["quantity"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="ordered_quantity", default=line["quantity"])
            line["uom"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="ordered_uom", default=line["uom"])
            line["unitPrice"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="unit_price", default=line["unitPrice"])
            line["currencyCode"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="currency_code", default=line["currencyCode"])
            line["requestedDeliveryDate"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="requested_delivery_date", default=line["requestedDeliveryDate"])
            line["plantCode"] = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="plant_code", default=line["plantCode"])

            payload["lines"].append(line)

        return {
            "content_type": "application/json",
            "file_extension": "json",
            "payload": payload,
            "meta": {
                "erp": "JDE",
                "message_type": "SalesOrder",
                "message_version": "Orchestrator",
                "adapter": self.adapter_name,
            },
        }
