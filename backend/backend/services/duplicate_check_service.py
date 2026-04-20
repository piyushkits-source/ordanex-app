
from __future__ import annotations

from sqlalchemy.orm import Session
from backend.db import models


def is_duplicate_po(
    db: Session,
    *,
    client_id: str,
    po_number: str,
    sold_to: str | None,
    ship_to: str | None,
    rule: dict | None,
) -> dict:
    """
    rule example:
    {
        "enabled": True,
        "scope": "sold_to_ship_to",   # client | sold_to | sold_to_ship_to
        "action": "route_to_review"   # reject | route_to_review | warn_only
    }
    """
    rule = rule or {}
    if not rule.get("enabled", False):
        return {"is_duplicate": False, "action": None, "matched_po_id": None, "reason": "rule disabled"}

    scope = rule.get("scope", "client")
    q = db.query(models.PurchaseOrder).filter(
        models.PurchaseOrder.client_id == client_id,
        models.PurchaseOrder.po_number == po_number,
    )

    if scope == "sold_to":
        q = q.filter(models.PurchaseOrder.sold_to == sold_to)
    elif scope == "sold_to_ship_to":
        q = q.filter(models.PurchaseOrder.sold_to == sold_to, models.PurchaseOrder.ship_to == ship_to)

    existing = q.order_by(models.PurchaseOrder.created_at.desc()).first()
    if not existing:
        return {"is_duplicate": False, "action": None, "matched_po_id": None, "reason": "no duplicate found"}

    return {
        "is_duplicate": True,
        "action": rule.get("action", "route_to_review"),
        "matched_po_id": str(existing.po_id),
        "reason": f"duplicate found for scope={scope}",
    }
