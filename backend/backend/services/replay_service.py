from __future__ import annotations

from typing import Any
from backend.core.environment import current_environment
from backend.db import models

VALID_REPLAY_STAGES = {"PARSING", "MAPPING", "TRANSFORMATION", "OUTBOUND"}

def replay_message(db, *, po_id: str, stage: str) -> dict[str, Any]:
    normalized_stage = (stage or "").upper().strip()
    if normalized_stage not in VALID_REPLAY_STAGES:
        raise ValueError(f"Invalid replay stage: {stage}")

    po = (
        db.query(models.PurchaseOrder)
        .filter(models.PurchaseOrder.po_id == po_id)
        .first()
    )
    if not po:
        raise ValueError("Purchase order not found")

    po.status = "REPROCESSING"
    if hasattr(po, "environment") and not getattr(po, "environment", None):
        po.environment = current_environment()

    db.add(po)

    if hasattr(models, "PoLog"):
        db.add(
            models.PoLog(
                po_id=po.po_id,
                client_id=getattr(po, "client_id", None),
                level="INFO",
                stage="REPLAY",
                message=f"Replay requested from stage: {normalized_stage}",
                created_by="system",
            )
        )

    db.commit()

    # Safe non-breaking behavior:
    # hand the message back to your existing reprocess/process pipeline.
    return {
        "status": "QUEUED",
        "po_id": str(po.po_id),
        "stage": normalized_stage,
        "environment": getattr(po, "environment", current_environment()),
        "message": "Replay request registered. Hook this into your existing processing task/service.",
    }
