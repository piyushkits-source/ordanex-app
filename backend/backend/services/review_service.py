
from __future__ import annotations

from sqlalchemy.orm import Session

from backend.db import models, schemas
from backend.core.deps import UserContext
from backend.services.purchase_order_service import purchase_order_service


class ReviewService:
    def get_review_queue(self, db: Session, *, client_id: str | None):
        query = db.query(models.PurchaseOrder)
        if client_id:
            query = query.filter(models.PurchaseOrder.client_id == client_id)

        if hasattr(models.PurchaseOrder, "needs_review"):
            query = query.filter(models.PurchaseOrder.needs_review.is_(True))
        else:
            query = query.filter(models.PurchaseOrder.status.in_(["NEEDS_REVIEW", "FAILED"]))

        return query.order_by(models.PurchaseOrder.created_at.desc()).all()

    def save_corrections(self, db: Session, po_id, payload: schemas.PurchaseOrderUpdate, user_ctx: UserContext):
        po = purchase_order_service.update_purchase_order(db, po_id, payload, user_ctx)
        if hasattr(po, "needs_review"):
            po.needs_review = False
        if hasattr(po, "review_status"):
            po.review_status = "CORRECTED"
        db.add(po)
        db.commit()
        db.refresh(po)
        return po

    def approve(self, db: Session, po_id, user_ctx: UserContext):
        po = purchase_order_service.get_purchase_order(db, po_id)
        po.status = "APPROVED"
        if hasattr(po, "needs_review"):
            po.needs_review = False
        if hasattr(po, "review_status"):
            po.review_status = "APPROVED"
        if hasattr(po, "approved_by_user_id"):
            po.approved_by_user_id = user_ctx.user_id
        db.add(po)
        db.commit()
        db.refresh(po)
        return po


review_service = ReviewService()
