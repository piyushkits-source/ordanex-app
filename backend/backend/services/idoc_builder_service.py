from __future__ import annotations

from datetime import datetime
from typing import Any


def _safe_str(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _format_date(value: Any) -> str:
    if value in (None, ""):
        return ""
    text = str(value).strip()
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        return text[:10].replace("-", "")
    return text


def _invoice_number(header: dict[str, Any]) -> str:
    return _safe_str(
        header.get("invoice_number")
        or header.get("billing_document_number")
        or header.get("document_number")
        or header.get("po_number")
        or f"AUTO_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    )


def build_orders05_idoc(mapped_payload: dict, partner_context: dict) -> dict:
    header = mapped_payload.get("header", {})
    items = mapped_payload.get("items", [])

    po_number = header.get("po_number") or f"AUTO_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    po_date = header.get("po_date") or datetime.utcnow().strftime("%Y%m%d")

    idoc = {
        "EDI_DC40": {
            "TABNAM": "EDI_DC40",
            "DIRECT": "2",
            "IDOCTYP": "ORDERS05",
            "MESTYP": "ORDERS",
            "SNDPOR": partner_context.get("sender_port", "ORDANEX"),
            "SNDPRT": partner_context.get("sender_type", "LS"),
            "SNDPRN": partner_context.get("sender_partner", "ORDANEX"),
            "RCVPOR": partner_context.get("receiver_port", "SAP"),
            "RCVPRT": partner_context.get("receiver_type", "LS"),
            "RCVPRN": partner_context.get("receiver_partner", "ERP"),
        },
        "E1EDK01": {
            "CURCY": header.get("currency"),
            "BSART": header.get("doc_type", "OR"),
            "BELNR": po_number,
        },
        "E1EDK02": [
            {
                "QUALF": "001",
                "BELNR": po_number,
                "DATUM": po_date,
            }
        ],
        "E1EDK03": [
            {
                "IDDAT": "012",
                "DATUM": po_date,
            }
        ],
        "E1EDKA1": [],
        "E1EDP01": [],
    }

    if header.get("sold_to_code"):
        idoc["E1EDKA1"].append({"PARVW": "AG", "PARTN": header.get("sold_to_code")})
    if header.get("ship_to_code"):
        idoc["E1EDKA1"].append({"PARVW": "WE", "PARTN": header.get("ship_to_code")})

    for idx, item in enumerate(items, start=1):
        idoc["E1EDP01"].append(
            {
                "POSEX": str(idx).zfill(6),
                "MENGE": item.get("quantity"),
                "MENEE": item.get("uom"),
                "E1EDP19": [
                    {
                        "QUALF": "002",
                        "IDTNR": item.get("material_code"),
                    }
                ],
            }
        )

    return idoc


def build_invoice_idoc(mapped_payload: dict, partner_context: dict) -> dict:
    header = mapped_payload.get("header", {}) or {}
    items = mapped_payload.get("items", []) or []

    invoice_number = _invoice_number(header)
    invoice_date = _format_date(header.get("invoice_date") or header.get("document_date") or header.get("po_date"))
    reference_po = _safe_str(header.get("reference_po_number") or header.get("po_number") or header.get("document_number"))
    currency = _safe_str(header.get("currency") or header.get("currency_code"))
    invoice_total = _safe_str(header.get("invoice_total") or header.get("document_total_amount"))

    idoc = {
        "EDI_DC40": {
            "TABNAM": "EDI_DC40",
            "DIRECT": "2",
            "IDOCTYP": "INVOIC02",
            "MESTYP": "INVOIC",
            "SNDPOR": partner_context.get("sender_port", "ORDANEX"),
            "SNDPRT": partner_context.get("sender_type", "LS"),
            "SNDPRN": partner_context.get("sender_partner", "ORDANEX"),
            "RCVPOR": partner_context.get("receiver_port", "SAP"),
            "RCVPRT": partner_context.get("receiver_type", "LS"),
            "RCVPRN": partner_context.get("receiver_partner", "ERP"),
        },
        "E1EDK01": {
            "CURCY": currency,
            "BELNR": invoice_number,
            "FKDAT": invoice_date,
            "NETWR": invoice_total,
            "BSART": "IV",
        },
        "E1EDK02": [
            {"QUALF": "001", "BELNR": reference_po},
        ],
        "E1EDKA1": [],
        "E1EDP01": [],
    }

    for idx, item in enumerate(items, start=1):
        quantity = _safe_str(item.get("normalized_quantity") or item.get("ordered_quantity") or item.get("quantity"))
        uom = _safe_str(item.get("normalized_uom") or item.get("ordered_uom") or item.get("uom"))
        desc = _safe_str(item.get("description"))
        unit_price = _safe_str(item.get("unit_price"))
        amount = _safe_str(item.get("amount"))
        material = _safe_str(item.get("internal_material_code") or item.get("supplier_product_code") or item.get("buyer_product_code") or item.get("material_code"))

        seg = {
            "POSEX": str(idx).zfill(6),
            "MENGE": quantity,
            "MENEE": uom,
            "E1EDP19": [],
        }
        if material:
            seg["E1EDP19"].append({"QUALF": "002", "IDTNR": material})
        if unit_price:
            seg["E1EDP05"] = [{"KSCHL": "PB00", "KRATE": unit_price}]
        if amount:
            seg["E1EDP26"] = [{"BETRG": amount}]
        if desc:
            seg["E1EDPT1"] = [{"TDID": "0001"}]
            seg["E1EDPT2"] = [{"TDLINE": desc}]
        idoc["E1EDP01"].append(seg)

    return idoc
