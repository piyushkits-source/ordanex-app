from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db import models
from backend.services.sap_release_engine import release_to_sap
from backend.services.release_retry_service import run_with_retry

router = APIRouter(prefix="/release", tags=["release"])


def _safe_json(v, default):
    return v if isinstance(v, dict) else default


@router.post("/{po_id}")
def release_purchase_order(po_id: int, payload: dict | None = None, db: Session = Depends(get_db)):
    payload = payload or {}

    po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    allowed_statuses = {"READY", "APPROVED", "CORRECTED"}
    current_status = str(getattr(po, "status", "") or "").upper()
    if current_status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"PO status {current_status} is not releasable",
        )

    xml_payload = getattr(po, "xml_payload", None)
    if not xml_payload:
        raise HTTPException(status_code=400, detail="XML payload not found on PO")

    client_id = getattr(po, "client_id", None)
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID missing on PO")

    cfg_rows = (
        db.query(models.ClientConfig)
        .filter(
            models.ClientConfig.client_id == client_id,
            models.ClientConfig.is_active == True,
        )
        .all()
    )

    sap_cfg = {}
    outbound_cfg = {}
    for row in cfg_rows:
        if row.config_type == "sap":
            sap_cfg = _safe_json(row.config_value_json, {})
        elif row.config_type == "outbound":
            outbound_cfg = _safe_json(row.config_value_json, {})

    max_attempts = int(payload.get("max_attempts", 3))

    result = run_with_retry(
        lambda: release_to_sap(
            po_number=getattr(po, "po_number", None),
            xml_payload=xml_payload,
            sap_cfg=sap_cfg,
            outbound_cfg=outbound_cfg,
        ),
        max_attempts=max_attempts,
    )

    # Persist release outcome on PO if fields exist
    if result.get("success"):
        po.status = "RELEASED_TO_SAP"
    else:
        po.status = "RELEASE_FAILED"

    if hasattr(po, "release_result_json"):
        po.release_result_json = result

    db.add(po)
    db.commit()
    db.refresh(po)

    return {
        "po_id": po.po_id,
        "po_number": getattr(po, "po_number", None),
        "status": po.status,
        "release_result": result,
    }
