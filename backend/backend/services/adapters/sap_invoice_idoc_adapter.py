from __future__ import annotations

from typing import Any, Dict

from backend.services.adapters.base_adapter import TargetAdapter
from backend.services.target_mapping_service import mapping_profile_from_flow, resolve_header_target_value, resolve_line_target_value


class SapInvoiceIdocAdapter(TargetAdapter):
    adapter_name = "sap_invoice_idoc"

    @staticmethod
    def _safe(value: Any) -> str:
        return "" if value is None else str(value).strip()

    @staticmethod
    def _format_sap_date(value: Any) -> str:
        if value in (None, ""):
            return ""
        text = str(value).strip()
        if len(text) >= 10 and text[4] == "-" and text[7] == "-":
            return text[:10].replace("-", "")
        if len(text) == 8 and text.isdigit():
            return text
        return text

    def build(self, canonical: Dict[str, Any], flow=None) -> Dict[str, Any]:
        header = canonical.get("header", {}) or {}
        parties = canonical.get("parties", {}) or {}
        items = canonical.get("items", []) or []
        mapping_profile = mapping_profile_from_flow(flow)

        invoice_number = resolve_header_target_value(
            canonical,
            mapping_profile=mapping_profile,
            target_field="invoice_number",
            default=header.get("invoice_number") or header.get("billing_document_number") or header.get("document_number") or header.get("po_number") or "",
        )
        invoice_date = resolve_header_target_value(
            canonical,
            mapping_profile=mapping_profile,
            target_field="invoice_date",
            default=header.get("invoice_date") or header.get("document_date") or header.get("po_date") or "",
        )
        currency = resolve_header_target_value(
            canonical,
            mapping_profile=mapping_profile,
            target_field="currency_code",
            default=header.get("currency_code") or header.get("currency") or "",
        )
        invoice_total = resolve_header_target_value(
            canonical,
            mapping_profile=mapping_profile,
            target_field="invoice_total",
            default=header.get("invoice_total") or header.get("document_total_amount") or "",
        )
        reference_po = resolve_header_target_value(
            canonical,
            mapping_profile=mapping_profile,
            target_field="reference_po_number",
            default=header.get("reference_po_number") or header.get("po_number") or header.get("document_number") or "",
        )
        buyer = parties.get("buyer") or parties.get("sold_to") or {}
        seller = parties.get("seller") or parties.get("supplier") or {}
        ship_to = parties.get("ship_to") or {}
        bill_to = parties.get("bill_to") or {}

        seller_code = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="seller_code", default=seller.get("partner_code") or seller.get("code") or "")
        buyer_code = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="buyer_code", default=buyer.get("partner_code") or buyer.get("code") or "")
        ship_to_code = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="ship_to_code", default=ship_to.get("partner_code") or ship_to.get("code") or "")
        bill_to_code = resolve_header_target_value(canonical, mapping_profile=mapping_profile, target_field="bill_to_code", default=bill_to.get("partner_code") or bill_to.get("code") or "")

        lines = []
        lines.append('<?xml version="1.0" encoding="UTF-8"?>')
        lines.append('<INVOIC02>')
        lines.append('  <EDI_DC40>')
        lines.append('    <IDOCTYP>INVOIC02</IDOCTYP>')
        lines.append('    <MESTYP>INVOIC</MESTYP>')
        lines.append('    <DIRECT>2</DIRECT>')
        lines.append('  </EDI_DC40>')
        lines.append('  <E1EDK01>')
        lines.append(f'    <CURCY>{currency}</CURCY>')
        lines.append('    <BSART>IV</BSART>')
        lines.append(f'    <BELNR>{invoice_number}</BELNR>')
        lines.append(f'    <FKDAT>{self._format_sap_date(invoice_date)}</FKDAT>')
        lines.append(f'    <NETWR>{invoice_total}</NETWR>')
        lines.append('  </E1EDK01>')
        lines.append('  <E1EDK02>')
        lines.append('    <QUALF>001</QUALF>')
        lines.append(f'    <BELNR>{reference_po}</BELNR>')
        lines.append('  </E1EDK02>')

        for qualifier, partn in (("AG", buyer_code), ("LF", seller_code), ("WE", ship_to_code), ("RE", bill_to_code)):
            if partn:
                lines.append('  <E1EDKA1>')
                lines.append(f'    <PARVW>{qualifier}</PARVW>')
                lines.append(f'    <PARTN>{partn}</PARTN>')
                lines.append('  </E1EDKA1>')

        for idx, item in enumerate(items, start=1):
            qty = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="ordered_quantity", default=item.get("ordered_quantity") or item.get("quantity") or "")
            uom = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="ordered_uom", default=item.get("ordered_uom") or item.get("uom") or "")
            desc = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="description", default=item.get("description") or "")
            price = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="unit_price", default=item.get("unit_price") or "")
            amount = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="amount", default=item.get("amount") or "")
            mat = resolve_line_target_value(canonical, item, mapping_profile=mapping_profile, target_field="internal_material_code", default=item.get("internal_material_code") or item.get("material_code") or "")
            lines.append('  <E1EDP01>')
            lines.append(f'    <POSEX>{str(idx).zfill(6)}</POSEX>')
            if mat:
                lines.append('    <E1EDP19>')
                lines.append('      <QUALF>001</QUALF>')
                lines.append(f'      <IDTNR>{mat}</IDTNR>')
                lines.append('    </E1EDP19>')
            lines.append(f'    <MENGE>{qty}</MENGE>')
            lines.append(f'    <MENEE>{uom}</MENEE>')
            if price:
                lines.append('    <E1EDP05>')
                lines.append('      <KSCHL>PB00</KSCHL>')
                lines.append(f'      <KRATE>{price}</KRATE>')
                lines.append('    </E1EDP05>')
            if amount:
                lines.append('    <E1EDP26>')
                lines.append(f'      <BETRG>{amount}</BETRG>')
                lines.append('    </E1EDP26>')
            if desc:
                lines.append('    <E1EDPT1>')
                lines.append('      <TDID>0001</TDID>')
                lines.append('    </E1EDPT1>')
                for text_line in [seg.strip() for seg in str(desc).splitlines() if seg.strip()]:
                    lines.append('    <E1EDPT2>')
                    lines.append(f'      <TDLINE>{text_line}</TDLINE>')
                    lines.append('    </E1EDPT2>')
            lines.append('  </E1EDP01>')

        lines.append('</INVOIC02>')

        return {
            "content_type": "application/xml",
            "file_extension": "xml",
            "payload": "\n".join(lines),
            "meta": {
                "erp": "SAP",
                "message_type": "INVOICE",
                "message_version": "INVOIC02",
                "adapter": self.adapter_name,
            },
        }
