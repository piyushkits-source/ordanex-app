from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.db.database import SessionLocal
from backend.db.schemas_monitoring import ActionResponse, ArchivePurchaseOrderRequest
from backend.services.purchase_order_actions_service import purchase_order_actions_service


router = APIRouter(prefix="/purchase-orders", tags=["Purchase Order Actions"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/{po_id}/archive", response_model=ActionResponse)
def archive_purchase_order(po_id: UUID, payload: ArchivePurchaseOrderRequest, db: Session = Depends(get_db)):
    return purchase_order_actions_service.archive(db, po_id, reason=payload.reason, comment=payload.comment)


@router.post("/{po_id}/reprocess", response_model=ActionResponse)
def reprocess_purchase_order(po_id: UUID, db: Session = Depends(get_db)):
    return purchase_order_actions_service.reprocess(db, po_id)
