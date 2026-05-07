from __future__ import annotations

from typing import Any, Dict

from backend.services.adapters.base_adapter import TargetAdapter
from backend.services.target_mapping_service import (
    mapping_profile_from_flow,
    resolve_header_target_value,
    resolve_line_target_value,
)


class OracleOrderXmlAdapter(TargetAdapter):
    adapter_name = "oracle_order_xml"

    def build(self, canonical: Dict[str, Any], flow=None) -> Dict[str, Any]:
        header = canonical.get("header", {})
        parties = canonical.get("parties", {})
        items = canonical.get("items", [])
        mapping_profile = mapping_profile_from_flow(flow)

        buyer = parties.get("buyer") or {}
        seller = parties.get("seller") or {}
        ship_to = parties.get("ship_to") or {}

        po_number = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="document_number", default=header.get("document_number") or header.get("po_number") or "")
        po_date = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="document_date", default=header.get("document_date") or header.get("po_date") or "")
        currency = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="currency_code", default=header.get("currency_code") or header.get("currency") or "")
        order_type = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="order_type", default=header.get("buyer_order_type") or header.get("seller_order_type") or "")
        buyer_name = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="buyer_name", default=buyer.get("partner_name") or "")
        buyer_code = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="buyer_code", default=buyer.get("partner_code") or "")
        seller_name = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="seller_name", default=seller.get("partner_name") or "")
        seller_code = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="seller_code", default=seller.get("partner_code") or "")
        ship_to_name = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="ship_to_name", default=ship_to.get("partner_name") or "")
        ship_to_code = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="ship_to_code", default=ship_to.get("partner_code") or "")

        lines = []
        lines.append('<?xml version="1.0" encoding="UTF-8"?>')
        lines.append("<OracleOrder>")
        lines.append(f"  <PONumber>{po_number}</PONumber>")
        lines.append(f"  <PODate>{po_date}</PODate>")
        lines.append(f"  <Currency>{currency}</Currency>")
        lines.append(f"  <OrderType>{order_type}</OrderType>")
        lines.append(f"  <BuyerName>{buyer_name}</BuyerName>")
        lines.append(f"  <BuyerCode>{buyer_code}</BuyerCode>")
        lines.append(f"  <SellerName>{seller_name}</SellerName>")
        lines.append(f"  <SellerCode>{seller_code}</SellerCode>")
        lines.append(f"  <ShipToName>{ship_to_name}</ShipToName>")
        lines.append(f"  <ShipToCode>{ship_to_code}</ShipToCode>")
        lines.append("  <Lines>")

        for idx, item in enumerate(items, start=1):
            item_code = item.get('supplier_product_code') or item.get('buyer_product_code') or item.get('internal_material_code') or ''
            buyer_item_code = item.get('buyer_product_code') or ''
            supplier_item_code = item.get('supplier_product_code') or ''
            internal_material_code = item.get('internal_material_code') or ''
            description = item.get('description', '')
            quantity = item.get('ordered_quantity', item.get('quantity', ''))
            uom = item.get('ordered_uom', item.get('uom', ''))
            unit_price = item.get('unit_price', '')
            item_currency = item.get('currency_code') or header.get('currency_code') or ''
            requested_delivery_date = item.get('requested_delivery_date') or item.get('delivery_date') or ''
            plant_code = item.get('plant_code') or ''

            item_code = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="item_code", default=item_code)
            buyer_item_code = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="buyer_product_code", default=buyer_item_code)
            supplier_item_code = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="supplier_product_code", default=supplier_item_code)
            internal_material_code = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="internal_material_code", default=internal_material_code)
            description = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="description", default=description)
            quantity = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="ordered_quantity", default=quantity)
            uom = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="ordered_uom", default=uom)
            unit_price = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="unit_price", default=unit_price)
            item_currency = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="currency_code", default=item_currency)
            requested_delivery_date = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="requested_delivery_date", default=requested_delivery_date)
            plant_code = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="plant_code", default=plant_code)

            lines.append("    <Line>")
            lines.append(f"      <LineNumber>{item.get('line_number') or idx}</LineNumber>")
            lines.append(f"      <ItemCode>{item_code}</ItemCode>")
            lines.append(f"      <BuyerItemCode>{buyer_item_code}</BuyerItemCode>")
            lines.append(f"      <SupplierItemCode>{supplier_item_code}</SupplierItemCode>")
            lines.append(f"      <InternalMaterialCode>{internal_material_code}</InternalMaterialCode>")
            lines.append(f"      <Description>{description}</Description>")
            lines.append(f"      <Quantity>{quantity}</Quantity>")
            lines.append(f"      <UOM>{uom}</UOM>")
            lines.append(f"      <UnitPrice>{unit_price}</UnitPrice>")
            lines.append(f"      <Currency>{item_currency}</Currency>")
            lines.append(f"      <RequestedDeliveryDate>{requested_delivery_date}</RequestedDeliveryDate>")
            lines.append(f"      <PlantCode>{plant_code}</PlantCode>")
            lines.append("    </Line>")

        lines.append("  </Lines>")
        lines.append("</OracleOrder>")

        return {
            "content_type": "application/xml",
            "file_extension": "xml",
            "payload": "\n".join(lines),
            "meta": {
                "erp": "ORACLE",
                "message_type": "ORDER",
                "message_version": "XML",
                "adapter": self.adapter_name,
            },
        }
