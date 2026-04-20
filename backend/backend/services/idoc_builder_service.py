from __future__ import annotations

from datetime import datetime


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