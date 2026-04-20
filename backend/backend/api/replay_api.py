from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.services.replay_service import replay_message

router = APIRouter(prefix="/replay", tags=["replay"])

@router.post("/{po_id}")
def replay_purchase_order(po_id: str, payload: dict, db: Session = Depends(get_db)):
    try:
        stage = str(payload.get("stage") or "").strip()
        return replay_message(db, po_id=po_id, stage=stage)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
