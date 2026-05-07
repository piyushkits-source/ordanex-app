from __future__ import annotations

from typing import Any, Dict

from backend.services.adapters.base_adapter import TargetAdapter
from backend.services.target_mapping_service import (
    mapping_profile_from_flow,
    resolve_header_target_value,
    resolve_line_target_value,
)


class SapOrders03Adapter(TargetAdapter):
    adapter_name = "sap_orders03"

    def build(self, canonical: Dict[str, Any], flow=None) -> Dict[str, Any]:
        header = canonical.get("header", {})
        parties = canonical.get("parties", {})
        items = canonical.get("items", [])
        mapping_profile = mapping_profile_from_flow(flow)

        po_number = header.get("document_number") or header.get("po_number", "")
        po_date = header.get("document_date") or header.get("po_date", "")
        currency = header.get("currency_code") or header.get("currency", "")

        buyer_party = parties.get("buyer") or parties.get("sold_to") or {}
        ship_to_party = parties.get("ship_to") or {}

        sold_to = buyer_party.get("partner_code") or buyer_party.get("code") or ""
        ship_to = ship_to_party.get("partner_code") or ship_to_party.get("code") or ""
        line_text_id = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="line_text_id", default="0001")

        po_number = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="document_number", default=po_number)
        po_date = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="document_date", default=po_date)
        currency = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="currency_code", default=currency)
        sold_to = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="sold_to_code", default=sold_to)
        ship_to = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="ship_to_code", default=ship_to)

        lines = []
        lines.append('<?xml version="1.0" encoding="UTF-8"?>')
        lines.append("<ORDERS03>")
        lines.append("  <EDI_DC40>")
        lines.append("    <IDOCTYP>ORDERS03</IDOCTYP>")
        lines.append("    <MESTYP>ORDERS</MESTYP>")
        lines.append("  </EDI_DC40>")
        lines.append("  <E1EDK01>")
        lines.append(f"    <CURCY>{currency}</CURCY>")
        lines.append("  </E1EDK01>")
        lines.append("  <E1EDK02>")
        lines.append("    <QUALF>001</QUALF>")
        lines.append(f"    <BELNR>{po_number}</BELNR>")
        lines.append(f"    <DATUM>{po_date}</DATUM>")
        lines.append("  </E1EDK02>")

        if sold_to:
            lines.append("  <E1EDKA1>")
            lines.append("    <PARVW>AG</PARVW>")
            lines.append(f"    <PARTN>{sold_to}</PARTN>")
            lines.append("  </E1EDKA1>")

        if ship_to:
            lines.append("  <E1EDKA1>")
            lines.append("    <PARVW>WE</PARVW>")
            lines.append(f"    <PARTN>{ship_to}</PARTN>")
            lines.append("  </E1EDKA1>")

        for idx, item in enumerate(items, start=1):
            quantity = item.get("ordered_quantity", item.get("quantity", ""))
            uom = item.get("ordered_uom", item.get("uom", ""))
            delivery_date = item.get("requested_delivery_date") or item.get("delivery_date") or ""
            description = item.get("description", "")
            buyer_code = item.get("buyer_product_code")
            supplier_code = item.get("supplier_product_code")
            internal_code = item.get("internal_material_code")

            quantity = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="ordered_quantity", default=quantity)
            uom = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="ordered_uom", default=uom)
            delivery_date = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="requested_delivery_date", default=delivery_date)
            description = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="description", default=description)
            buyer_code = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="buyer_product_code", default=buyer_code)
            supplier_code = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="supplier_product_code", default=supplier_code)
            internal_code = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="internal_material_code", default=internal_code)

            lines.append("  <E1EDP01>")
            lines.append(f"    <POSEX>{str(idx).zfill(6)}</POSEX>")
            lines.append(f"    <MENGE>{quantity}</MENGE>")
            lines.append(f"    <MENEE>{uom}</MENEE>")

            if buyer_code:
                lines.append("    <E1EDP19>")
                lines.append("      <QUALF>001</QUALF>")
                lines.append(f"      <IDTNR>{buyer_code}</IDTNR>")
                lines.append("    </E1EDP19>")

            if supplier_code:
                lines.append("    <E1EDP19>")
                lines.append("      <QUALF>002</QUALF>")
                lines.append(f"      <IDTNR>{supplier_code}</IDTNR>")
                lines.append("    </E1EDP19>")

            if internal_code:
                lines.append("    <E1EDP19>")
                lines.append("      <QUALF>003</QUALF>")
                lines.append(f"      <IDTNR>{internal_code}</IDTNR>")
                lines.append("    </E1EDP19>")

            if delivery_date:
                lines.append("    <E1EDP03>")
                lines.append("      <IDDAT>002</IDDAT>")
                lines.append(f"      <DATUM>{delivery_date}</DATUM>")
                lines.append("    </E1EDP03>")

            if description:
                lines.append("    <E1EDPT1>")
                lines.append(f"      <TDID>{line_text_id}</TDID>")
                lines.append("      <TSSPRAS>EN</TSSPRAS>")
                lines.append("    </E1EDPT1>")
                lines.append("    <E1EDPT2>")
                lines.append(f"      <TDLINE>{description}</TDLINE>")
                lines.append("    </E1EDPT2>")

            lines.append("  </E1EDP01>")

        lines.append("</ORDERS03>")

        return {
            "content_type": "application/xml",
            "file_extension": "xml",
            "payload": "\n".join(lines),
            "meta": {
                "erp": "SAP",
                "message_type": "ORDERS",
                "message_version": "ORDERS03",
                "adapter": self.adapter_name,
            },
        }
