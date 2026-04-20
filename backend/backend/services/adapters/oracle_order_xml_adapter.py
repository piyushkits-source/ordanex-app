from __future__ import annotations

from typing import Any, Dict

from backend.services.adapters.base_adapter import TargetAdapter


class OracleOrderXmlAdapter(TargetAdapter):
    adapter_name = "oracle_order_xml"

    def build(self, canonical: Dict[str, Any], flow=None) -> Dict[str, Any]:
        header = canonical.get("header", {})
        items = canonical.get("items", [])

        lines = []
        lines.append('<?xml version="1.0" encoding="UTF-8"?>')
        lines.append("<OracleOrder>")
        lines.append(f"  <PONumber>{header.get('po_number', '')}</PONumber>")
        lines.append(f"  <PODate>{header.get('po_date', '')}</PODate>")
        lines.append(f"  <Currency>{header.get('currency', '')}</Currency>")
        lines.append("  <Lines>")

        for idx, item in enumerate(items, start=1):
            lines.append("    <Line>")
            lines.append(f"      <LineNumber>{idx}</LineNumber>")
            lines.append(f"      <ItemCode>{item.get('supplier_product_code') or item.get('buyer_product_code') or ''}</ItemCode>")
            lines.append(f"      <Description>{item.get('description', '')}</Description>")
            lines.append(f"      <Quantity>{item.get('quantity', '')}</Quantity>")
            lines.append(f"      <UOM>{item.get('uom', '')}</UOM>")
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