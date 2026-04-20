from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.db.database import get_db
from backend.db import models
from backend.services.xml_service import generate_xml_for_po
from backend.services.rbac import get_current_user, require_roles, enforce_client_scope

router = APIRouter(prefix="/purchase-orders", tags=["XML"])

@router.post("/{po_id}/generate-xml")
def generate_po_xml(po_id: str, db: Session = Depends(get_db), current_user=Depends(require_roles("super_admin", "client_admin", "operations"))):
    po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    enforce_client_scope(current_user, po.client_id)
    po, xml_str = generate_xml_for_po(db=db, po_id=po_id, created_by=current_user.email)
    return {"po_id": str(po.po_id), "po_number": po.po_number, "status": po.status, "xml_payload": xml_str, "message": "XML generated successfully from DB PO"}

@router.get("/{po_id}/xml")
def get_po_xml(po_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    enforce_client_scope(current_user, po.client_id)
    return {"po_id": str(po.po_id), "po_number": po.po_number, "xml_payload": po.xml_payload or ""}
