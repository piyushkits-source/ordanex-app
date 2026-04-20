from __future__ import annotations

from typing import Any


DEFAULT_IDOC_FIELD_MAP = {
    "po_number": "E1EDK02-BELNR",
    "po_date": "E1EDK03-DATUM",
    "currency": "E1EDK01-CURCY",
    "po_type": "E1EDK01-BSART",
    "order_type": "E1EDK01-AUART",
    "sold_to": "E1EDKA1-AG",
    "ship_to": "E1EDKA1-WE",
    "line_no": "E1EDP01-POSEX",
    "material": "E1EDP01-MATNR",
    "quantity": "E1EDP01-MENGE",
    "uom": "E1EDP01-MENEE",
    "delivery_date": "E1EDP20-EDATU",
    "customer_material": "E1EDP19-CUSTOMER_IDTNR",
    "supplier_material": "E1EDP19-SUPPLIER_IDTNR",
    "manufacturer_material": "E1EDP19-MANUFACTURER_IDTNR",
}


def build_business_defaults(
    *,
    sender: str = "EXTSYS",
    receiver: str = "SAPSYS",
    idoctyp: str = "ORDERS05",
    mestyp: str = "ORDERS",
    po_type: str = "NB",
    order_type: str = "OR",
    e1edp19_precedence: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "xml_profile": {
            "root_tag": "ORDERS05",
            "partner_id_field": "LIFNR",
            "default_bsart": po_type,
            "default_auart": order_type,
            "control_record": {
                "TABNAM": "EDI_DC40",
                "DIRECT": "2",
                "IDOCTYP": idoctyp,
                "MESTYP": mestyp,
                "SNDPOR": sender,
                "SNDPRT": "LS",
                "SNDPRN": sender,
                "RCVPOR": receiver,
                "RCVPRT": "LS",
                "RCVPRN": receiver,
            },
        },
        "e1edp19_rules": {
            "precedence": e1edp19_precedence
            or [
                "supplier_material",
                "customer_material",
                "manufacturer_material",
                "material",
            ],
            "qualifiers": {
                "customer_material": "001",
                "supplier_material": "002",
                "manufacturer_material": "002",
                "material": "002",
            },
        },
    }


def generate_mapping_from_parsed_doc(
    parsed_doc: dict,
    profile_name: str,
    client_id: str,
    sold_to: str | None = None,
    ship_to: str | None = None,
    *,
    sender: str = "EXTSYS",
    receiver: str = "SAPSYS",
    idoctyp: str = "ORDERS05",
    mestyp: str = "ORDERS",
    po_type: str = "NB",
    order_type: str = "OR",
) -> dict[str, Any]:
    header = parsed_doc.get("header", {}) or {}
    meta = parsed_doc.get("parser_meta", {}) or {}
    field_columns = meta.get("field_columns", {}) or {}

    header_mapping: dict[str, str] = {}
    item_mapping: dict[str, str] = {}
    bbox_mapping: dict[str, Any] = {}

    for src_field, target in DEFAULT_IDOC_FIELD_MAP.items():
        if target.startswith("E1EDK") or target.startswith("E1EDKA"):
            header_mapping[target] = src_field
        else:
            item_mapping[target] = src_field

    # Ensure business defaults are always part of generated profile
    header_mapping["E1EDK01-BSART"] = "po_type"
    header_mapping["E1EDK01-AUART"] = "order_type"

    for field, col in field_columns.items():
        bbox_mapping[field] = {
            "page": meta.get("layout_page"),
            "column": {
                "x_start": col.get("x_start"),
                "x_end": col.get("x_end"),
                "x_mid": col.get("x_mid"),
            },
            "source_used": meta.get("source_used"),
        }

    business_defaults = build_business_defaults(
        sender=sender,
        receiver=receiver,
        idoctyp=idoctyp,
        mestyp=mestyp,
        po_type=po_type,
        order_type=order_type,
    )

    mapping_json = {
        "header_mapping": header_mapping,
        "item_mapping": item_mapping,
        "bbox_mapping": bbox_mapping,
        "field_columns": field_columns,
        "layout_signature": meta.get("layout_signature"),
        "xml_profile": business_defaults["xml_profile"],
        "e1edp19_rules": business_defaults["e1edp19_rules"],
    }

    return {
        "client_id": client_id,
        "profile_name": profile_name,
        "sold_to": sold_to,
        "ship_to": ship_to,
        "priority": 100,
        "description": f"Auto-generated lightweight onboarding profile for {header.get('supplier') or 'vendor'}",
        "mapping_json": mapping_json,
        "is_active": True,
    }