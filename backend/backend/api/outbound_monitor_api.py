from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db import models
from backend.tasks.outbound_tasks import deliver_po

router = APIRouter(prefix="/outbound-monitor", tags=["outbound-monitor"])


@router.get("/")
def get_all_deliveries(db: Session = Depends(get_db)):
    pos = db.query(models.PurchaseOrder).order_by(models.PurchaseOrder.po_id.desc()).limit(200).all()

    result = []
    for po in pos:
        result.append({
            "po_id": po.po_id,
            "po_number": po.po_number,
            "client_id": po.client_id,
            "supplier_name": po.supplier_name,
            "status": po.status,
            "delivery_status": po.status,
            "outbound_result": getattr(po, "outbound_result_json", {}),
        })

    return result


@router.post("/retry/{po_id}")
def retry_delivery(po_id: int, db: Session = Depends(get_db)):
    from backend.services.outbound_integration_framework import run_outbound_integration

    po = db.query(models.PurchaseOrder).filter_by(po_id=po_id).first()

    if not po:
        return {"error": "PO not found"}
     
    task = deliver_po.delay(po_id)

    po.status = "DELIVERY_QUEUED"
    if hasattr(po, "delivery_task_id"):
        po.delivery_task_id = task.id

    db.commit()
    return {
        "message": "Retry queued",
        "po_id": po.po_id,
        "task_id": task.id,
        "status": po.status,
    }


    header = {
        "po_number": po.po_number,
        "currency": po.currency,
        "supplier_name": po.supplier_name,
        "client_id": po.client_id,
    }

    items = getattr(po, "items", [])

    integration_cfg = {}
    cfg_rows = db.query(models.ClientConfig).filter_by(
        client_id=po.client_id,
        config_type="outbound_integration",
        is_active=True,
    ).all()

    for row in cfg_rows:
        integration_cfg = row.config_value_json or {}

    result = run_outbound_integration(
        header=header,
        items=items,
        integration_cfg=integration_cfg,
    )

    po.outbound_result_json = result
    po.status = "DELIVERED" if result.get("success") else "DELIVERY_FAILED"

    db.commit()

    return result
