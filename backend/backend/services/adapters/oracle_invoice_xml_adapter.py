from __future__ import annotations

from typing import Any, Dict
import xml.etree.ElementTree as ET

from backend.services.adapters.base_adapter import TargetAdapter
from backend.services.target_mapping_service import mapping_profile_from_flow, resolve_header_target_value, resolve_line_target_value


class OracleInvoiceXmlAdapter(TargetAdapter):
    adapter_name = "oracle_invoice_xml"

    @staticmethod
    def _safe(value: Any) -> str:
        return "" if value is None else str(value).strip()

    @staticmethod
    def _format_date(value: Any) -> str:
        if value in (None, ""):
            return ""
        text = str(value).strip()
        if len(text) >= 10 and text[4] == "-" and text[7] == "-":
            return text[:10]
        return text

    def _append(self, parent: ET.Element, tag: str, value: Any) -> None:
        node = ET.SubElement(parent, tag)
        node.text = self._safe(value)

    def build(self, canonical: Dict[str, Any], flow=None) -> Dict[str, Any]:
        header = canonical.get("header", {}) or {}
        parties = canonical.get("parties", {}) or {}
        items = canonical.get("items", []) or []
        mapping_profile = mapping_profile_from_flow(flow)

        buyer = parties.get("buyer") or parties.get("sold_to") or {}
        seller = parties.get("seller") or parties.get("supplier") or {}
        ship_to = parties.get("ship_to") or {}
        bill_to = parties.get("bill_to") or {}

        root = ET.Element("Invoice")
        self._append(root, "InvoiceNumber", resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="invoice_number", default=header.get("invoice_number") or header.get("billing_document_number") or header.get("document_number") or header.get("po_number")))
        self._append(root, "InvoiceDate", self._format_date(resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="invoice_date", default=header.get("invoice_date") or header.get("document_date") or header.get("po_date"))))
        self._append(root, "Currency", resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="currency_code", default=header.get("currency_code") or header.get("currency")))
        self._append(root, "InvoiceTotal", resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="invoice_total", default=header.get("invoice_total") or header.get("document_total_amount")))
        self._append(root, "ReferencePONumber", resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="reference_po_number", default=header.get("reference_po_number") or header.get("po_number") or header.get("document_number")))

        parties_node = ET.SubElement(root, "Parties")
        for section_name, section in (
            ("Buyer", buyer),
            ("Seller", seller),
            ("ShipTo", ship_to),
            ("BillTo", bill_to),
        ):
            section_node = ET.SubElement(parties_node, section_name)
            self._append(section_node, "Name", section.get("partner_name") or header.get(f"{section_name.lower()}_name"))
            self._append(section_node, "Code", section.get("partner_code") or header.get(f"{section_name.lower()}_code"))

        lines_node = ET.SubElement(root, "Lines")
        for idx, item in enumerate(items, start=1):
            line_node = ET.SubElement(lines_node, "Line")
            self._append(line_node, "LineNumber", resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="line_number", default=item.get("line_number") or idx))
            self._append(line_node, "ItemCode", resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="internal_material_code", default=item.get("internal_material_code") or item.get("supplier_product_code") or item.get("buyer_product_code") or item.get("material_code")))
            self._append(line_node, "Description", resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="description", default=item.get("description")))
            self._append(line_node, "Quantity", resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="ordered_quantity", default=item.get("normalized_quantity") or item.get("ordered_quantity") or item.get("quantity")))
            self._append(line_node, "UOM", resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="ordered_uom", default=item.get("normalized_uom") or item.get("ordered_uom") or item.get("uom")))
            self._append(line_node, "UnitPrice", resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="unit_price", default=item.get("unit_price")))
            self._append(line_node, "Amount", resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="amount", default=item.get("amount")))
            self._append(line_node, "RequestedDeliveryDate", resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="requested_delivery_date", default=item.get("requested_delivery_date") or item.get("delivery_date")))

        payload = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" + ET.tostring(root, encoding="unicode")

        return {
            "content_type": "application/xml",
            "file_extension": "xml",
            "payload": payload,
            "meta": {
                "erp": "ORACLE",
                "message_type": "INVOICE",
                "message_version": "XML",
                "adapter": self.adapter_name,
            },
        }
