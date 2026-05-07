from __future__ import annotations

import xml.etree.ElementTree as ET

from backend.services.parsers.base import SourceParser


class XmlParser(SourceParser):
    parser_name = "xml"

    def parse(self, message, profile=None):
        raw = message.get("raw_text") or ""
        root = ET.fromstring(raw)

        def first_text(*paths: str):
            for xpath in paths:
                value = root.findtext(xpath)
                if value not in [None, ""]:
                    return value
            return None

        header = {
            "po_number": first_text(".//poNumber", ".//PurchaseOrderNumber"),
            "po_date": first_text(".//poDate", ".//PurchaseOrderDate"),
            "sold_to": first_text(".//soldTo", ".//BillTo", ".//Customer"),
            "ship_to": first_text(".//shipTo", ".//ShipToName"),
            "ship_to_name": first_text(".//ShipToName"),
            "ship_to_address": " ".join(
                [
                    x
                    for x in [
                        first_text(".//ShipToAddressLine1"),
                        first_text(".//ShipToTownCityName"),
                        first_text(".//ShipToPostalCode"),
                    ]
                    if x
                ]
            ) or None,
            "supplier_name": first_text(".//SupplierName", ".//TemplateName"),
            "currency": first_text(".//CurrencyCode"),
        }

        items = []
        item_nodes = root.findall(".//item") or root.findall(".//row")
        for idx, item in enumerate(item_nodes, start=1):
            items.append(
                {
                    "line_no": item.get("LineNumber") or idx,
                    "material_code": item.findtext("material") or item.findtext("SupplierProductCode"),
                    "description": item.findtext("description") or item.findtext("ProductDescription"),
                    "quantity": item.findtext("quantity") or item.findtext("OrderingQuantity"),
                    "uom": item.findtext("uom") or item.findtext("OrderingUOM"),
                    "unit_price": item.findtext("price") or item.findtext("UnitPrice"),
                    "delivery_date": item.findtext("DeliveryDate") or header.get("po_date"),
                }
            )

        return {
            "raw_text": raw,
            "header": header,
            "items": items,
            "meta": {
                "parser": self.parser_name,
                "source_format": "XML",
            },
        }
