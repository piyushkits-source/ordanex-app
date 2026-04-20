from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.services.vendor_learning_service import vendor_learning_service
from backend.db import models

router = APIRouter(prefix="/vendor-learning", tags=["vendor-learning"])


@router.get("/")
def list_vendor_learning(client_id: str, supplier_name: str | None = None, db: Session = Depends(get_db)):
    query = db.query(models.VendorLayoutLearning).filter(
        models.VendorLayoutLearning.client_id == client_id
    )

    if supplier_name:
        query = query.filter(models.VendorLayoutLearning.supplier_name == supplier_name)

    return {"items": query.all()}


@router.post("/approve")
def approve_vendor_learning(payload: dict, db: Session = Depends(get_db)):
    try:
        row = vendor_learning_service.learn_from_document(
            db=db,
            client_id=payload["client_id"],
            supplier_name=payload["supplier_name"],
            header=payload.get("header", {}),
            items=payload.get("items", []),
            raw_text=payload.get("raw_text", ""),
            mappings=payload.get("mappings", []),
            approved_by=payload.get("approved_by", "system"),
        )
        db.commit()
        return {"vendor_learning_id": str(row.vendor_learning_id)}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))