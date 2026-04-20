
import re
from typing import Any


def map_header_fields(raw_text: str, header_mapping: dict) -> dict:
    """
    header_mapping example:
    {
        "po_number": ["Purchase Order", "PO Number", "Bon commande"],
        "po_date": ["Order date", "Date"],
        "customer": ["Delivery Address", "Invoice To", "Bill To"],
        "ship_to": ["Ship To", "Delivery Address"],
        "currency": ["Currency", "Order Total"],
        "custom_header_ref": ["Reference", "Your Ref"]
    }
    """
    mapped = {}
    raw_text = raw_text or ""

    for target, keywords in (header_mapping or {}).items():
        for kw in keywords:
            pattern = rf"{re.escape(kw)}[:\s]+(.+)"
            match = re.search(pattern, raw_text, re.IGNORECASE)
            if match:
                value = match.group(1).strip()
                value = re.split(r"\n|\r|\t", value)[0].strip()
                mapped[target] = value
                break

    return mapped


def map_line_item_fields(item_row: dict[str, Any], item_mapping: dict) -> dict:
    """
    item_mapping supports mapping any extracted text/column to any line-level standard field.
    """
    return {
        "material_code": item_row.get(item_mapping.get("material_field", "material")),
        "description": item_row.get(item_mapping.get("description_field", "description")),
        "quantity": item_row.get(item_mapping.get("quantity_field", "quantity")),
        "uom": item_row.get(item_mapping.get("uom_field", "uom")) or item_mapping.get("uom_default", "EA"),
        "unit_price": item_row.get(item_mapping.get("price_field", "unit_price")),
        "amount": item_row.get(item_mapping.get("amount_field", "amount")),
        "delivery_date": item_row.get(item_mapping.get("delivery_date_field", "delivery_date")),
        "plant": item_mapping.get("plant_override", "") or item_row.get("plant"),
    }


def extract_delivery_date(raw_text: str) -> str:
    patterns = [
        r"Delivery date\s+(\d{2}/\w{3}/\d{4})",
        r"Delivery date\s+(\d{2}/\d{2}/\d{4})",
        r"Delivery\s+Date\s+(\d{2}/\d{2}/\d{4})",
    ]
    for p in patterns:
        m = re.search(p, raw_text or "", re.IGNORECASE)
        if m:
            return m.group(1)
    return ""
