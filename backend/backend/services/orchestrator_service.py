
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.db import models


class OrchestratorService:
    """
    Central orchestration layer for inbound → extraction → PO → outbound flow.

    This starter is intentionally lightweight so you can wire your existing
    modules without breaking current functionality. Replace the placeholder
    sections with your actual parser / AI / OCR / mapping / outbound logic.
    """

    def process_inbound(self, db: Session, inbound_message_id) -> dict:
        if not hasattr(models, "InboundMessage"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="InboundMessage model is not available. Add the new SaaS models first.",
            )

        inbound = (
            db.query(models.InboundMessage)
            .filter(models.InboundMessage.inbound_message_id == inbound_message_id)
            .first()
        )
        if not inbound:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Inbound message not found.",
            )

        inbound.status = "PROCESSING"
        db.add(inbound)
        db.flush()

        # TODO:
        # 1. detect format
        # 2. call OCR / AI / structured parser
        # 3. create / update purchase_orders and items
        # 4. write processing logs
        # 5. route to review or auto process

        # Minimal placeholder behavior
        inbound.status = "PROCESSED"
        db.add(inbound)
        db.commit()
        db.refresh(inbound)

        return {
            "status": "SUCCESS",
            "inbound_message_id": str(inbound.inbound_message_id),
            "message": "Inbound message processed by orchestrator placeholder.",
        }

    def process_po(self, db: Session, po_id) -> dict:
        po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_id == po_id).first()
        if not po:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Purchase order not found.",
            )

        # TODO:
        # 1. apply business rules
        # 2. apply UOM conversions
        # 3. resolve mapping profile
        # 4. generate ERP payload
        # 5. create outbound message
        # 6. dispatch using target protocol

        po.status = "READY_FOR_OUTBOUND"
        db.add(po)
        db.commit()
        db.refresh(po)

        return {
            "status": "SUCCESS",
            "po_id": str(po.po_id),
            "message": "Purchase order processed by orchestrator placeholder.",
        }


orchestrator_service = OrchestratorService()
