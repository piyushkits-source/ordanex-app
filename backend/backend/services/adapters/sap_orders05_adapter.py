from __future__ import annotations

from typing import Any, Dict

from backend.services.adapters.base_adapter import TargetAdapter


class SapOrders05Adapter(TargetAdapter):
    adapter_name = "sap_orders05"

    def build(self, canonical: Dict[str, Any], flow=None) -> Dict[str, Any]:
        header = canonical.get("header", {})
        parties = canonical.get("parties", {})
        items = canonical.get("items", [])

        po_number = header.get("po_number", "")
        po_date = header.get("po_date", "")
        currency = header.get("currency", "")
        doc_type = header.get("doc_type", "OR")

        sold_to = (parties.get("sold_to") or {}).get("code", "")
        ship_to = (parties.get("ship_to") or {}).get("code", "")

        lines = []
        lines.append('<?xml version="1.0" encoding="UTF-8"?>')
        lines.append("<ORDERS05>")
        lines.append("  <EDI_DC40>")
        lines.append("    <IDOCTYP>ORDERS05</IDOCTYP>")
        lines.append("    <MESTYP>ORDERS</MESTYP>")
        lines.append("  </EDI_DC40>")
        lines.append("  <E1EDK01>")
        lines.append(f"    <CURCY>{currency}</CURCY>")
        lines.append(f"    <BSART>{doc_type}</BSART>")
        lines.append("  </E1EDK01>")
        lines.append("  <E1EDK02>")
        lines.append("    <QUALF>001</QUALF>")
        lines.append(f"    <BELNR>{po_number}</BELNR>")
        lines.append(f"    <DATUM>{po_date}</DATUM>")
        lines.append("  </E1EDK02>")
        lines.append("  <E1EDK03>")
        lines.append("    <IDDAT>012</IDDAT>")
        lines.append(f"    <DATUM>{po_date}</DATUM>")
        lines.append("  </E1EDK03>")

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
            lines.append("  <E1EDP01>")
            lines.append(f"    <POSEX>{str(idx).zfill(6)}</POSEX>")
            lines.append(f"    <MENGE>{item.get('quantity', '')}</MENGE>")
            lines.append(f"    <MENEE>{item.get('uom', '')}</MENEE>")

            buyer_code = item.get("buyer_product_code")
            supplier_code = item.get("supplier_product_code")
            internal_code = item.get("internal_material_code")

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

            lines.append("  </E1EDP01>")

        lines.append("</ORDERS05>")

        return {
            "content_type": "application/xml",
            "file_extension": "xml",
            "payload": "\n".join(lines),
            "meta": {
                "erp": "SAP",
                "message_type": "ORDERS",
                "message_version": "ORDERS05",
                "adapter": self.adapter_name,
            },
        }