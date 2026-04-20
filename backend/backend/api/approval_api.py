from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.db import models
from datetime import datetime

router = APIRouter(prefix="/approval", tags=["approval"])


@router.post("/approve/{po_id}")
def approve_po(po_id: int, db: Session = Depends(get_db)):
    po = db.query(models.PurchaseOrder).filter_by(po_id=po_id).first()

    po.status = "APPROVED"
    po.approved_at = datetime.utcnow()

    db.commit()

    return {"message": "PO approved"}


@router.post("/reject/{po_id}")
def reject_po(po_id: int, reason: str, db: Session = Depends(get_db)):
    po = db.query(models.PurchaseOrder).filter_by(po_id=po_id).first()

    po.status = "REJECTED"
    po.rejection_reason = reason

    db.commit()

    return {"message": "PO rejected"}
