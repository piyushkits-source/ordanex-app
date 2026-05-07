
from __future__ import annotations

import json
from typing import Any


def build_canonical_document(
    source_payload: dict[str, Any],
    meta: dict[str, Any] | None = None,
    derived_codes: dict[str, Any] | None = None,
) -> dict[str, Any]:
    meta = meta or {}
    derived_codes = derived_codes or {}

    header = source_payload.get("header", {}) or {}
    items = source_payload.get("items", []) or []

    canonical_items: list[dict[str, Any]] = []
    for idx, item in enumerate(items, start=1):
        canonical_items.append(
            {
                "line_number": str(item.get("line_number") or idx),
                "buyer_product_code": item.get("buyer_product_code") or item.get("customer_material_code"),
                "supplier_product_code": item.get("supplier_product_code") or item.get("vendor_material_code"),
                "internal_material_code": item.get("material_code"),
                "gtin": item.get("gtin"),
                "description": item.get("description"),
                "ordered_quantity": item.get("quantity_original", item.get("quantity")),
                "ordered_uom": item.get("uom_original", item.get("uom")),
                "normalized_quantity": item.get("quantity"),
                "normalized_uom": item.get("uom"),
                "unit_price": item.get("unit_price"),
                "price_basis_quantity": item.get("price_basis_quantity"),
                "price_basis_uom": item.get("price_basis_uom"),
                "currency_code": item.get("currency_code") or header.get("currency") or header.get("currency_code"),
                "requested_delivery_date": item.get("delivery_date") or item.get("requested_delivery_date"),
                "plant_code": item.get("plant_code") or header.get("plant_code"),
                "storage_location": item.get("storage_location"),
                "customer_line_reference": item.get("customer_line_reference"),
                "notes": item.get("notes"),
                "schedule_lines": item.get("schedule_lines") or [],
                "raw_extensions": item.get("raw_extensions") or {},
            }
        )

    canonical = {
        "meta": {
            "document_type": meta.get("document_type", "PO"),
            "message_direction": meta.get("message_direction", "INBOUND"),
            "source_format": meta.get("source_format", "PDF"),
            "source_standard": meta.get("source_standard"),
            "source_message_type": meta.get("source_message_type"),
            "source_version": meta.get("source_version"),
            "target_erp": meta.get("target_erp"),
            "target_standard": meta.get("target_standard"),
            "target_message_type": meta.get("target_message_type"),
            "target_version": meta.get("target_version"),
            "flow_id": meta.get("flow_id"),
            "client_id": meta.get("client_id"),
            "vertical_id": meta.get("vertical_id"),
            "partner_id": meta.get("partner_id"),
            "source_document_id": meta.get("source_document_id"),
        },
        "header": {
            "document_number": header.get("po_number") or header.get("document_number"),
            "document_date": header.get("po_date") or header.get("document_date"),
            "invoice_number": header.get("invoice_number") or header.get("billing_document_number"),
            "invoice_date": header.get("invoice_date"),
            "invoice_total": header.get("invoice_total") or header.get("document_total_amount"),
            "reference_po_number": header.get("reference_po_number") or header.get("po_number") or header.get("document_number"),
            "due_date": header.get("due_date"),
            "payment_term_code": header.get("payment_term_code") or header.get("payment_terms"),
            "tax_total": header.get("tax_total"),
            "freight_total": header.get("freight_total"),
            "currency_code": header.get("currency") or header.get("currency_code"),
            "document_status": header.get("document_status") or "NEW",
            "buyer_order_type": header.get("buyer_order_type"),
            "seller_order_type": header.get("doc_type") or header.get("seller_order_type"),
            "incoterm_code": header.get("incoterm_code"),
            "payment_term_code": header.get("payment_term_code"),
            "notes": header.get("notes"),
        },
        "parties": {
            "buyer": {
                "partner_name": header.get("buyer_name"),
                "partner_code": derived_codes.get("sold_to_code") or header.get("buyer_code"),
                "identifier_type": "BUYER",
                "external_ids": {
                    "customer_code": derived_codes.get("sold_to_code") or header.get("buyer_code"),
                },
            },
            "seller": {
                "partner_name": header.get("seller_name"),
                "partner_code": header.get("seller_code"),
                "identifier_type": "SELLER",
                "external_ids": {
                    "supplier_code": header.get("seller_code"),
                },
            },
            "ship_to": {
                "partner_name": header.get("ship_to_name"),
                "partner_code": derived_codes.get("ship_to_code") or header.get("ship_to_code"),
                "identifier_type": "SHIP_TO",
                "external_ids": {
                    "ship_to_code": derived_codes.get("ship_to_code") or header.get("ship_to_code"),
                },
            },
            "bill_to": {
                "partner_name": header.get("bill_to_name"),
                "partner_code": derived_codes.get("bill_to_code") or header.get("bill_to_code"),
                "identifier_type": "BILL_TO",
                "external_ids": {
                    "bill_to_code": derived_codes.get("bill_to_code") or header.get("bill_to_code"),
                },
            },
        },
        "references": [
            {
                "reference_type": "CUSTOMER_PO",
                "reference_number": header.get("po_number") or header.get("document_number"),
            }
        ],
        "dates": [
            {
                "date_type": "DOCUMENT_DATE",
                "date_value": header.get("po_date") or header.get("document_date"),
            }
        ],
        "addresses": [
            {
                "address_role": "SHIP_TO",
                "name": header.get("ship_to_name"),
                "line1": header.get("ship_to_address1"),
                "line2": header.get("ship_to_address2"),
                "city": header.get("ship_to_city"),
                "state": header.get("ship_to_state"),
                "postal_code": header.get("ship_to_postal_code"),
                "country_code": header.get("ship_to_country"),
                "resolved_master_id": derived_codes.get("matched_address_id"),
                "resolved_codes": {
                    "ship_to_code": derived_codes.get("ship_to_code"),
                    "sold_to_code": derived_codes.get("sold_to_code"),
                    "bill_to_code": derived_codes.get("bill_to_code"),
                },
                "match_score": derived_codes.get("address_match_score"),
            }
        ],
        "items": canonical_items,
        "totals": {
            "line_count": len(canonical_items),
            "document_total_amount": header.get("document_total_amount"),
            "currency_code": header.get("currency") or header.get("currency_code"),
        },
        "attachments": source_payload.get("attachments") or [],
        "raw_extensions": source_payload.get("raw_extensions") or {},
    }

    return canonical


def canonical_json_bytes(canonical_doc: dict[str, Any]) -> bytes:
    return json.dumps(canonical_doc, indent=2, ensure_ascii=False).encode("utf-8")
