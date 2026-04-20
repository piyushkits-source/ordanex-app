from __future__ import annotations

import csv
import io
import json
from typing import Any
import xml.etree.ElementTree as ET


def _safe_str(v: Any) -> str:
    return "" if v is None else str(v).strip()


def adapt_to_generic_json(canonical_order: dict, config: dict) -> tuple[str, str]:
    return "application/json", json.dumps(canonical_order, indent=2)


def adapt_to_generic_csv(canonical_order: dict, config: dict) -> tuple[str, str]:
    output = io.StringIO()
    writer = csv.writer(output)

    header = canonical_order.get("order_header", {}) or {}
    items = canonical_order.get("order_items", []) or []

    writer.writerow([
        "po_number", "po_date", "currency", "supplier_name",
        "sold_to", "ship_to", "line_no", "material_code",
        "description", "quantity", "uom", "unit_price",
        "amount", "delivery_date", "plant"
    ])

    for item in items:
        writer.writerow([
            header.get("po_number"),
            header.get("po_date"),
            header.get("currency"),
            header.get("supplier_name"),
            header.get("sold_to"),
            header.get("ship_to"),
            item.get("line_no"),
            item.get("material_code"),
            item.get("description"),
            item.get("quantity"),
            item.get("uom"),
            item.get("unit_price"),
            item.get("amount"),
            item.get("delivery_date"),
            item.get("plant"),
        ])

    return "text/csv", output.getvalue()


def adapt_to_generic_xml(canonical_order: dict, config: dict) -> tuple[str, str]:
    root = ET.Element("Order")
    hdr = ET.SubElement(root, "Header")
    header = canonical_order.get("order_header", {}) or {}

    for k, v in header.items():
        node = ET.SubElement(hdr, k)
        node.text = "" if v is None else str(v)

    items_node = ET.SubElement(root, "Items")
    for item in canonical_order.get("order_items", []) or []:
        item_node = ET.SubElement(items_node, "Item")
        for k, v in item.items():
            node = ET.SubElement(item_node, k)
            node.text = "" if v is None else str(v)

    xml_str = ET.tostring(root, encoding="unicode")
    return "application/xml", xml_str


def adapt_to_sap_idoc(canonical_order: dict, config: dict) -> tuple[str, str]:
    # placeholder adapter; replace with your actual IDoc builder
    root = ET.Element("ORDERS05")
    header = canonical_order.get("order_header", {}) or {}

    hdr = ET.SubElement(root, "E1EDK01")
    curcy = ET.SubElement(hdr, "CURCY")
    curcy.text = _safe_str(header.get("currency"))

    ref = ET.SubElement(root, "E1EDK02")
    qualf = ET.SubElement(ref, "QUALF")
    qualf.text = "001"
    belnr = ET.SubElement(ref, "BELNR")
    belnr.text = _safe_str(header.get("po_number"))

    for item in canonical_order.get("order_items", []) or []:
        itm = ET.SubElement(root, "E1EDP01")
        posex = ET.SubElement(itm, "POSEX")
        posex.text = str(item.get("line_no") or "")
        matnr = ET.SubElement(itm, "MATNR")
        matnr.text = _safe_str(item.get("material_code"))
        menge = ET.SubElement(itm, "MENGE")
        menge.text = "" if item.get("quantity") is None else str(item.get("quantity"))

    return "application/xml", ET.tostring(root, encoding="unicode")


ADAPTER_REGISTRY = {
    "generic_json": adapt_to_generic_json,
    "generic_csv": adapt_to_generic_csv,
    "generic_xml": adapt_to_generic_xml,
    "sap_idoc": adapt_to_sap_idoc,
}
