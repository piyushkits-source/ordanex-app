
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.db import models
from backend.core.deps import UserContext


class DocumentIntelligenceService:
    def get_field_boxes(self, db: Session, po_id) -> list[dict]:
        po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_id == po_id).first()
        if not po:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found.")
        return getattr(po, "field_boxes_json", []) or []

    def save_field_boxes(self, db: Session, po_id, boxes: list[dict], user_ctx: UserContext) -> list[dict]:
        po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_id == po_id).first()
        if not po:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found.")
        if not hasattr(po, "field_boxes_json"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="field_boxes_json column is missing.")
        po.field_boxes_json = boxes
        db.add(po)
        db.commit()
        db.refresh(po)
        return po.field_boxes_json

    def auto_detect(self, db: Session, po_id) -> dict:
        po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_id == po_id).first()
        if not po:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found.")
        return {
            "header": {
                "po_number": po.po_number,
                "po_date": po.po_date.isoformat() if po.po_date else None,
                "supplier_name": po.supplier_name,
            },
            "items": [
                {
                    "line_no": item.line_no,
                    "material_code": item.material_code,
                    "description": item.description,
                    "quantity": float(item.quantity) if item.quantity is not None else None,
                }
                for item in po.items
            ],
        }


document_intelligence_service = DocumentIntelligenceService()
