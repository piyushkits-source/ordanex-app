from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from decimal import Decimal, InvalidOperation
import json
from typing import Any, Callable
import xml.etree.ElementTree as ET

from backend.services.idoc_builder_service import build_orders05_idoc, build_invoice_idoc


class BuilderRegistryError(Exception):
    pass


INVOICE_MESSAGE_TYPES = {"INVOICE", "AP_INVOICE", "AR_INVOICE"}
XML_MESSAGE_STANDARDS = {"XML"}
EDI_MESSAGE_STANDARDS = {"X12", "EDIFACT"}


def _safe_text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _invoice_message_type(value: Any) -> str:
    return _safe_text(value).upper()


def _append_xml(parent: ET.Element, tag: str, value: Any) -> None:
    if isinstance(value, Mapping):
        node = ET.SubElement(parent, tag)
        for key, child_value in value.items():
            _append_xml(node, str(key), child_value)
        return
    if isinstance(value, list):
        node = ET.SubElement(parent, tag)
        for item in value:
            _append_xml(node, "Item", item)
        return
    node = ET.SubElement(parent, tag)
    node.text = _safe_text(value)


def _serialize_xml_document(*, root_name: str, mapped_payload: dict[str, Any], partner_context: dict[str, Any]) -> str:
    header = mapped_payload.get("header", {}) or {}
    items = mapped_payload.get("items", []) or []

    root = ET.Element(root_name)
    meta = ET.SubElement(root, "Meta")
    _append_xml(meta, "GeneratedAt", datetime.utcnow().isoformat())
    _append_xml(meta, "TargetERP", partner_context.get("target_erp"))
    _append_xml(meta, "TargetStandard", partner_context.get("target_message_standard"))
    _append_xml(meta, "TargetType", partner_context.get("target_message_type"))
    _append_xml(meta, "TargetVersion", partner_context.get("target_message_version"))

    header_node = ET.SubElement(root, "Header")
    for key, value in header.items():
        _append_xml(header_node, str(key), value)

    items_node = ET.SubElement(root, "Items")
    for item in items:
        item_node = ET.SubElement(items_node, "Item")
        for key, value in item.items():
            _append_xml(item_node, str(key), value)

    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" + ET.tostring(root, encoding="unicode")


def _format_edi_date(value: Any) -> str:
    text = _safe_text(value)
    if not text:
        return ""
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        return text[:10].replace("-", "")
    if len(text) == 8 and text.isdigit():
        return text
    return text


def _safe_decimal(value: Any) -> Decimal | None:
    text = _safe_text(value).replace(",", "")
    if not text:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def _decimal_to_amount(value: Any) -> str:
    dec = _safe_decimal(value)
    if dec is None:
        return ""
    return f"{dec:.2f}"


def build_orders03_idoc(mapped_payload: dict, partner_context: dict) -> dict:
    payload = build_orders05_idoc(mapped_payload, partner_context)
    payload["EDI_DC40"]["IDOCTYP"] = "ORDERS03"
    return payload


def build_generic_rest_payload(mapped_payload: dict, partner_context: dict) -> dict:
    return {
        "meta": {"target": partner_context},
        "payload": mapped_payload,
    }


def build_generic_xml_payload(mapped_payload: dict, partner_context: dict) -> dict:
    message_type = _invoice_message_type(partner_context.get("target_message_type"))
    is_invoice = message_type in INVOICE_MESSAGE_TYPES
    root_name = "Invoice" if is_invoice else "Document"
    return {
        "content_type": "application/xml",
        "file_extension": "xml",
        "payload": _serialize_xml_document(root_name=root_name, mapped_payload=mapped_payload, partner_context=partner_context),
        "meta": {
            "erp": partner_context.get("target_erp") or "GENERIC",
            "message_type": message_type or ("INVOICE" if is_invoice else partner_context.get("target_message_type")),
            "message_version": partner_context.get("target_message_version") or "XML",
            "message_family": "INVOICE" if is_invoice else (partner_context.get("target_message_type") or "DOCUMENT"),
            "adapter": "generic_xml",
        },
    }


def build_x12_invoice_payload(mapped_payload: dict, partner_context: dict) -> dict:
    header = mapped_payload.get("header", {}) or {}
    items = mapped_payload.get("items", []) or []
    invoice_number = _safe_text(header.get("invoice_number") or header.get("billing_document_number") or header.get("document_number") or header.get("po_number") or "INV001")
    invoice_date = _format_edi_date(header.get("invoice_date") or header.get("document_date") or header.get("po_date"))
    reference_po = _safe_text(header.get("reference_po_number") or header.get("po_number") or header.get("document_number"))
    currency = _safe_text(header.get("currency_code") or header.get("currency") or "USD")
    buyer = (mapped_payload.get("parties", {}) or {}).get("buyer") or (mapped_payload.get("parties", {}) or {}).get("sold_to") or {}
    seller = (mapped_payload.get("parties", {}) or {}).get("seller") or (mapped_payload.get("parties", {}) or {}).get("supplier") or {}
    total = _safe_decimal(header.get("invoice_total") or header.get("document_total_amount")) or Decimal("0")

    segments = [
        "ISA*00*          *00*          *ZZ*ORDANEX         *ZZ*RECEIVER        *260506*1200*U*00401*000000001*0*P*>~",
        "GS*IN*ORDANEX*RECEIVER*20260506*1200*1*X*004010~",
        "ST*810*0001~",
        f"BIG*{invoice_date or '20260506'}*{invoice_number}**{reference_po or ''}~",
        f"CUR*BY*{currency}~",
    ]
    if buyer.get("partner_name") or buyer.get("partner_code"):
        segments.append(f"N1*BY*{_safe_text(buyer.get('partner_name') or buyer.get('partner_code'))}~")
    if seller.get("partner_name") or seller.get("partner_code"):
        segments.append(f"N1*SU*{_safe_text(seller.get('partner_name') or seller.get('partner_code'))}~")

    line_count = 0
    for idx, item in enumerate(items, start=1):
        quantity = _safe_text(item.get("normalized_quantity") or item.get("ordered_quantity") or item.get("quantity") or "1")
        uom = _safe_text(item.get("normalized_uom") or item.get("ordered_uom") or item.get("uom") or "EA")
        unit_price = _decimal_to_amount(item.get("unit_price"))
        item_code = _safe_text(item.get("internal_material_code") or item.get("supplier_product_code") or item.get("buyer_product_code") or item.get("material_code"))
        desc = _safe_text(item.get("description"))
        segments.append(f"IT1*{idx}*{quantity}*{uom}*{unit_price}**BP*{item_code}~")
        if desc:
            segments.append(f"PID*F****{desc}~")
        line_count += 1

    tds_value = int((total * Decimal("100")).quantize(Decimal("1")))
    segments.extend([
        f"TDS*{tds_value}~",
        f"CTT*{line_count}~",
        "SE*1*0001~",
        "GE*1*1~",
        "IEA*1*000000001~",
    ])

    payload = "".join(segments)
    return {
        "content_type": "application/x-x12",
        "file_extension": "x12",
        "payload": payload,
        "meta": {
            "erp": partner_context.get("target_erp") or "GENERIC",
            "message_type": "INVOICE",
            "message_version": "810",
            "message_family": "INVOICE",
            "adapter": "x12_invoice",
        },
    }


def build_edifact_invoice_payload(mapped_payload: dict, partner_context: dict) -> dict:
    header = mapped_payload.get("header", {}) or {}
    items = mapped_payload.get("items", []) or []
    invoice_number = _safe_text(header.get("invoice_number") or header.get("billing_document_number") or header.get("document_number") or header.get("po_number") or "INV001")
    invoice_date = _format_edi_date(header.get("invoice_date") or header.get("document_date") or header.get("po_date"))
    reference_po = _safe_text(header.get("reference_po_number") or header.get("po_number") or header.get("document_number"))
    currency = _safe_text(header.get("currency_code") or header.get("currency") or "USD")
    buyer = (mapped_payload.get("parties", {}) or {}).get("buyer") or (mapped_payload.get("parties", {}) or {}).get("sold_to") or {}
    seller = (mapped_payload.get("parties", {}) or {}).get("seller") or (mapped_payload.get("parties", {}) or {}).get("supplier") or {}
    total = _decimal_to_amount(header.get("invoice_total") or header.get("document_total_amount"))

    segments = [
        "UNB+UNOC:3+ORDANEX+RECEIVER+260506:1200+1'",
        "UNH+1+INVOIC:D:96A:UN'",
        f"BGM+380+{invoice_number}+9'",
    ]
    if invoice_date:
        segments.append(f"DTM+137:{invoice_date}:102'")
    if reference_po:
        segments.append(f"RFF+ON:{reference_po}'")
    if currency:
        segments.append(f"CUX+2:{currency}:9'")
    if buyer.get("partner_name") or buyer.get("partner_code"):
        segments.append(f"NAD+BY+{_safe_text(buyer.get('partner_name') or buyer.get('partner_code'))}::9'")
    if seller.get("partner_name") or seller.get("partner_code"):
        segments.append(f"NAD+SU+{_safe_text(seller.get('partner_name') or seller.get('partner_code'))}::9'")

    line_count = 0
    for idx, item in enumerate(items, start=1):
        item_code = _safe_text(item.get("internal_material_code") or item.get("supplier_product_code") or item.get("buyer_product_code") or item.get("material_code"))
        quantity = _safe_text(item.get("normalized_quantity") or item.get("ordered_quantity") or item.get("quantity") or "1")
        uom = _safe_text(item.get("normalized_uom") or item.get("ordered_uom") or item.get("uom") or "EA")
        amount = _decimal_to_amount(item.get("amount") or item.get("unit_price"))
        segments.append(f"LIN+{idx}++{item_code}:IN'")
        segments.append(f"QTY+47:{quantity}:{uom}'")
        if amount:
            segments.append(f"PRI+AAA:{amount}'")
        desc = _safe_text(item.get("description"))
        if desc:
            segments.append(f"IMD+F++::{desc}'")
        line_count += 1

    segments.extend([
        "UNS+S'",
        f"CNT+2:{line_count}'",
        f"MOA+9:{total}'",
        f"UNT+{len(segments) + 1}+1'",
        "UNZ+1+1'",
    ])

    payload = "".join(segments)
    return {
        "content_type": "application/edifact",
        "file_extension": "edi",
        "payload": payload,
        "meta": {
            "erp": partner_context.get("target_erp") or "GENERIC",
            "message_type": "INVOICE",
            "message_version": "INVOIC",
            "message_family": "INVOICE",
            "adapter": "edifact_invoice",
        },
    }


def resolve_output_builder(
    *,
    target_erp: str,
    target_message_standard: str,
    target_message_type: str,
    target_message_version: str | None,
) -> Callable[[dict, dict], dict]:
    erp = (target_erp or "").upper()
    standard = (target_message_standard or "").upper()
    msg_type = (target_message_type or "").upper()
    msg_version = (target_message_version or "").upper()

    if erp == "SAP" and standard == "IDOC" and msg_type in INVOICE_MESSAGE_TYPES:
        return build_invoice_idoc
    if erp == "SAP" and standard == "IDOC" and msg_type in {"ORDERS", "ORDERS05"} and msg_version in {"", "ORDERS05"}:
        return build_orders05_idoc
    if erp == "SAP" and standard == "IDOC" and msg_type in {"ORDERS", "ORDERS03"} and msg_version == "ORDERS03":
        return build_orders03_idoc
    if standard == "X12" and msg_type in INVOICE_MESSAGE_TYPES:
        return build_x12_invoice_payload
    if standard == "EDIFACT" and msg_type in INVOICE_MESSAGE_TYPES:
        return build_edifact_invoice_payload
    if standard in XML_MESSAGE_STANDARDS:
        return build_generic_xml_payload
    if standard in EDI_MESSAGE_STANDARDS:
        return build_generic_rest_payload
    if standard in {"API", "JSON"}:
        return build_generic_rest_payload
    raise BuilderRegistryError(
        f"No builder registered for target_erp={target_erp}, target_message_standard={target_message_standard}, target_message_type={target_message_type}, target_message_version={target_message_version}"
    )
