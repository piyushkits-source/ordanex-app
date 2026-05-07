
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.db import models
from backend.core.deps import UserContext
from backend.services.adapter_registry import get_target_adapter
from backend.services.invoice_validation_service import (
    validate_inbound_ap_invoice_3way,
    validate_outbound_invoice_totals,
)


INVOICE_MESSAGE_TYPES = {"INVOICE", "AP_INVOICE", "AR_INVOICE"}
from backend.services.parsed_payload_builder import build_parsed_payload_from_po
from backend.services.purchase_order_service import (
    resolve_default_target_profile,
    resolve_document_type,
)
from backend.services.idoc_mapping_orchestrator import orchestrate_mapping_and_rules
from backend.services.transformation_service import transformation_service


class OutboundService:
    @staticmethod
    def _resolve_target_context(po, document_type: str) -> dict:
        default_target_erp, default_target_standard, default_target_type, default_target_version = resolve_default_target_profile(document_type)
        target_erp = str(getattr(po, "target_system", None) or default_target_erp or "GENERIC").strip().upper()
        target_standard = str(getattr(po, "target_protocol", None) or default_target_standard or "JSON").strip().upper()
        target_message_type = str(getattr(po, "target_message_type", None) or default_target_type or ("INVOICE" if document_type == "INVOICE" else "ORDERS")).strip().upper()
        target_message_version = str(getattr(po, "target_message_version", None) or default_target_version or "v1").strip()

        if document_type == "INVOICE" and target_message_type not in INVOICE_MESSAGE_TYPES:
            target_message_type = "INVOICE"
        if target_standard == "IDOC" and document_type == "INVOICE" and target_message_version in {"", "v1"}:
            target_message_version = "INVOIC02"

        return {
            "target_erp": target_erp,
            "target_standard": target_standard,
            "target_message_type": target_message_type,
            "target_message_version": target_message_version,
        }


    def create_or_get_outbound_message(self, db: Session, po_id, user_ctx: UserContext):
        if not hasattr(models, "OutboundMessage"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OutboundMessage model is not available.")

        outbound = db.query(models.OutboundMessage).filter(models.OutboundMessage.po_id == po_id).first()
        if outbound:
            return outbound

        po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_id == po_id).first()
        if not po:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found.")

        document_type = resolve_document_type(db, po)
        target_context = self._resolve_target_context(po, document_type)

        outbound = models.OutboundMessage(
            client_id=po.client_id,
            po_id=po.po_id,
            target_protocol=target_context["target_standard"],
            target_system=target_context["target_erp"],
            status="READY",
        )
        db.add(outbound)
        db.commit()
        db.refresh(outbound)
        return outbound

    def dispatch(self, db: Session, po_id, user_ctx: UserContext) -> dict:
        outbound = self.create_or_get_outbound_message(db, po_id, user_ctx)
        po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_id == po_id).first()
        document_type = resolve_document_type(db, po)
        if po and (po.direction or "").upper() != "OUTBOUND":
            po.direction = "OUTBOUND"
            db.add(po)

        if document_type == "INVOICE":
            parsed_data = build_parsed_payload_from_po(po)
            canonical = orchestrate_mapping_and_rules(
                db,
                client_id=po.client_id,
                parsed_data=parsed_data,
            ).get("som") or {}

            validation_result = (
                validate_outbound_invoice_totals(po, canonical)
                if (po.direction or "OUTBOUND").upper() == "OUTBOUND"
                else validate_inbound_ap_invoice_3way(db, po, canonical)
            )
            if validation_result.get("blocked"):
                po.status = "PENDING"
                po.needs_review = True
                po.review_status = "INVOICE_VALIDATION_PENDING"
                po.po_validation_reason = validation_result.get("reason")
                outbound.status = "BLOCKED"
                outbound.attempt_count = (outbound.attempt_count or 0) + 1
                db.add(po)
                db.add(outbound)
                db.commit()
                db.refresh(po)
                db.refresh(outbound)
                return {
                    "status": "PENDING",
                    "po_id": str(po.po_id),
                    "outbound_message_id": str(outbound.outbound_message_id),
                    "validation_result": validation_result,
                }

            target_context = self._resolve_target_context(po, document_type)
            adapter = get_target_adapter(
                target_erp=target_context["target_erp"],
                target_standard=target_context["target_standard"],
                target_message_type=target_context["target_message_type"],
                target_message_version=target_context["target_message_version"],
            )
            built = adapter.build(canonical, flow=None)
            payload = built["payload"]
            if hasattr(po, "target_payload_json"):
                po.target_payload_json = payload if isinstance(payload, (dict, list)) or built["content_type"] == "application/json" else None
            po.xml_payload = payload if isinstance(payload, str) else None
            po.target_adapter_name = built["meta"].get("adapter")
            po.target_content_type = built["content_type"]
        else:
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
