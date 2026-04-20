
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from backend.db.database import get_db


router = APIRouter(prefix="/messages", tags=["Message Canonical"])


@router.get("/{message_id}/canonical")
def download_canonical(message_id: UUID, db: Session = Depends(get_db)):
    '''
    Expected integration:
    - replace `Message` lookup with your actual monitor/message table
    - persist canonical JSON on the message row after execution, e.g. `canonical_json`
    '''
    Message = None

    try:
        from backend.db import models
        Message = getattr(models, "Message", None)
    except Exception:
        Message = None

    if Message is None:
        raise HTTPException(
            status_code=501,
            detail="Message model is not wired yet. Add canonical_json to your monitor message table and update this endpoint.",
        )

    row = db.query(Message).filter(Message.message_id == message_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Message not found.")

    canonical_json = getattr(row, "canonical_json", None)
    if not canonical_json:
        raise HTTPException(status_code=404, detail="Canonical payload not found for this message.")

    return Response(
        content=canonical_json,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="canonical_{message_id}.json"'
        },
    )
