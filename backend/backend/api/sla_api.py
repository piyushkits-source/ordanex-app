from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db import models
from backend.services.sla_service import compute_po_sla

router = APIRouter(prefix="/sla", tags=["sla"])


def _safe_dict(v, default=None):
    return v if isinstance(v, dict) else (default or {})


@router.get("/orders")
def get_orders_sla(client_id: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.PurchaseOrder)

    if client_id:
        q = q.filter(models.PurchaseOrder.client_id == client_id)

    rows = q.order_by(models.PurchaseOrder.po_id.desc()).limit(300).all()

    # optional client SLA config
    sla_cfg = {}
    if client_id:
        cfg_rows = (
            db.query(models.ClientConfig)
            .filter(
                models.ClientConfig.client_id == client_id,
                models.ClientConfig.config_type == "sla_config",
                models.ClientConfig.is_active == True,
            )
            .all()
        )
        for row in cfg_rows:
            sla_cfg = _safe_dict(row.config_value_json, {})

    out = []
    for po in rows:
        sla = compute_po_sla(po, sla_cfg=sla_cfg)

        out.append(
            {
                "po_id": po.po_id,
                "po_number": getattr(po, "po_number", None),
                "client_id": getattr(po, "client_id", None),
                "supplier_name": getattr(po, "supplier_name", None),
                "status": getattr(po, "status", None),
                **sla,
            }
        )

    return out
