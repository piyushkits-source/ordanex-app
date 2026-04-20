from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db import models
from backend.tasks.outbound_tasks import deliver_po

router = APIRouter(prefix="/outbound-queue", tags=["outbound-queue"])


@router.post("/{po_id}/enqueue")
def enqueue_delivery(po_id: int, db: Session = Depends(get_db)):
    po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    current_status = str(getattr(po, "status", "") or "").upper()
    if current_status not in {"READY", "APPROVED", "CORRECTED", "DELIVERY_FAILED"}:
        raise HTTPException(status_code=400, detail=f"PO status {current_status} is not queueable")

    task = deliver_po.delay(po_id)

    po.status = "DELIVERY_QUEUED"
    if hasattr(po, "delivery_task_id"):
        po.delivery_task_id = task.id

    db.add(po)
    db.commit()
    db.refresh(po)

    return {
        "message": "Delivery job queued",
        "po_id": po.po_id,
        "task_id": task.id,
        "status": po.status,
    }
