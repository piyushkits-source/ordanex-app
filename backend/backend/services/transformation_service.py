
from __future__ import annotations

from sqlalchemy.orm import Session

from backend.db import models


class TransformationService:
    def generate_xml_payload(self, db: Session, po_id) -> str:
        po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_id == po_id).first()
        if not po:
            raise ValueError("Purchase order not found.")

        lines = "".join(
            f"<Item><LineNo>{item.line_no}</LineNo><Material>{item.material_code or ''}</Material><Qty>{item.quantity or ''}</Qty></Item>"
            for item in po.items
        )
        return (
            f"<SalesOrder>"
            f"<PONumber>{po.po_number or ''}</PONumber>"
            f"<PODate>{po.po_date.isoformat() if po.po_date else ''}</PODate>"
            f"<Supplier>{po.supplier_name or ''}</Supplier>"
            f"{lines}"
            f"</SalesOrder>"
        )


transformation_service = TransformationService()
