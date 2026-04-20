from __future__ import annotations
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from backend.db import models

VALID_ARCHIVE_REASONS = {"NOT_A_VALID_PO", "PO_ALREADY_MANUALLY_ENTERED", "PO_REQUIRE_CHANGES_AT_CUSTOMER_END"}

class PurchaseOrderActionsService:
    def archive(self, db: Session, po_id: UUID, *, reason: str, comment: str | None = None) -> dict[str, str]:
        if reason not in VALID_ARCHIVE_REASONS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid archive reason.")
        po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_id == po_id).first()
        if not po:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found.")
        if str(getattr(po, "status", "")).upper() not in {"PENDING", "ERROR"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archive allowed only for Pending or Error.")
        po.status = "ARCHIVED"
        db.add(po)
        db.commit()
        return {"status": "SUCCESS", "message": "Purchase order archived successfully."}

    def reprocess(self, db: Session, po_id: UUID) -> dict[str, str]:
        po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_id == po_id).first()
        if not po:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found.")
        if str(getattr(po, "status", "")).upper() not in {"PENDING", "ERROR"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reprocess allowed only for Pending or Error.")
        po.status = "REPROCESSING"
        db.add(po)
        db.commit()
        return {"status": "SUCCESS", "message": "Reprocess request submitted successfully."}

purchase_order_actions_service = PurchaseOrderActionsService()
