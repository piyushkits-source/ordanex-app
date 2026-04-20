from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db import models

router = APIRouter(prefix="/processing-trace", tags=["processing-trace"])


@router.get("/{po_id}")
def get_processing_trace(po_id: str, db: Session = Depends(get_db)):
    po = (
        db.query(models.PurchaseOrder)
        .filter(models.PurchaseOrder.po_id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    return {
        "po_id": str(po.po_id),
        "po_number": getattr(po, "po_number", None),
        "status": getattr(po, "status", None),
        "client_id": getattr(po, "client_id", None),
        "supplier_name": getattr(po, "supplier_name", None),
        "sender": getattr(po, "sender", None),
        "receiver": getattr(po, "receiver", None),
        "direction": getattr(po, "direction", None),
        "environment": getattr(po, "environment", None),
        "received_at": getattr(po, "received_at", None),
        "processed_at": getattr(po, "processed_at", None),
        "delivered_at": getattr(po, "delivered_at", None),
        "parser_snapshot": getattr(po, "parser_snapshot_json", None) or {},
        "vendor_learning": getattr(po, "vendor_learning_json", None) or {},
        "mapping_resolution": getattr(po, "mapping_resolution_json", None) or {},
        "applied_rules": getattr(po, "applied_rules_json", None) or [],
        "validation_hits": getattr(po, "validation_hits_json", None) or [],
        "copilot_result": getattr(po, "copilot_result_json", None) or {},
        "decision": getattr(po, "decision", None),
        "decision_reason": getattr(po, "decision_reason", None),
        "created_at": getattr(po, "created_at", None),
        "updated_at": getattr(po, "updated_at", None),
    }