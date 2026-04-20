from __future__ import annotations

from sqlalchemy.orm import Session

from backend.db import models
from backend.services.address_matching_engine import rank_address_candidates


def build_input_address_text(working_payload: dict) -> str:
    header = working_payload.get("header", {})
    parts = [
        header.get("ship_to_name"),
        header.get("ship_to_address1"),
        header.get("ship_to_address2"),
        header.get("ship_to_city"),
        header.get("ship_to_state"),
        header.get("ship_to_postal_code"),
        header.get("ship_to_country"),
    ]
    return " ".join([str(x).strip() for x in parts if x])


def resolve_address_codes(db: Session, partner_id: str, working_payload: dict) -> dict:
    source_text = build_input_address_text(working_payload)
    if not source_text.strip():
        return {}

    rows = (
        db.query(models.AddressMaster)
        .filter(
            models.AddressMaster.partner_id == partner_id,
            models.AddressMaster.is_active == True,  # noqa: E712
        )
        .all()
    )

    candidates = rank_address_candidates(source_text, rows, limit=3)
    if not candidates:
        return {}

    best = candidates[0].payload
    return {
        "matched_address_id": best.get("address_id"),
        "ship_to_code": best.get("ship_to_code"),
        "sold_to_code": best.get("sold_to_code"),
        "bill_to_code": best.get("bill_to_code"),
        "supplier_code": best.get("supplier_code"),
        "warehouse_code": best.get("warehouse_code"),
        "delivery_location_code": best.get("delivery_location_code"),
        "address_match_score": candidates[0].score,
    }