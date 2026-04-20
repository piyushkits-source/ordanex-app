
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.db import models
from backend.core.deps import UserContext
from backend.services.transformation_service import transformation_service


class OutboundService:
    def create_or_get_outbound_message(self, db: Session, po_id, user_ctx: UserContext):
        if not hasattr(models, "OutboundMessage"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OutboundMessage model is not available.")

        outbound = db.query(models.OutboundMessage).filter(models.OutboundMessage.po_id == po_id).first()
        if outbound:
            return outbound

        po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_id == po_id).first()
        if not po:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found.")

        outbound = models.OutboundMessage(
            client_id=po.client_id,
            po_id=po.po_id,
            target_protocol=getattr(po, "target_protocol", None) or "IDOC",
            target_system="SAP",
            status="READY",
        )
        db.add(outbound)
        db.commit()
        db.refresh(outbound)
        return outbound

    def dispatch(self, db: Session, po_id, user_ctx: UserContext) -> dict:
        outbound = self.create_or_get_outbound_message(db, po_id, user_ctx)
        po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_id == po_id).first()
        payload = transformation_service.generate_xml_payload(db, po_id)

        po.xml_payload = payload
        po.status = "DISPATCHED"
        outbound.status = "SENT"
        outbound.attempt_count = (outbound.attempt_count or 0) + 1

        db.add(po)
        db.add(outbound)
        db.commit()
        db.refresh(po)
        db.refresh(outbound)

        return {
            "status": "SUCCESS",
            "po_id": str(po.po_id),
            "outbound_message_id": str(outbound.outbound_message_id),
            "target_protocol": outbound.target_protocol,
            "xml_payload": payload,
        }


outbound_service = OutboundService()
