
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db import models

router = APIRouter(prefix="/email", tags=["email"])


class ProcessEmailRequest(BaseModel):
    client_id: str


@router.post("/process")
def process_email(payload: ProcessEmailRequest, db: Session = Depends(get_db)):
    # Plug your real ingestion engine here
    # Example:
    # from backend.services.email.email_engine import process_emails
    # result = process_emails(...)
    return {
        "message": "Email processing triggered",
        "client_id": payload.client_id,
        "status": "STARTED",
    }


@router.get("/history")
def email_history(client_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(models.EmailLog)
        .filter(models.EmailLog.client_id == client_id)
        .order_by(models.EmailLog.created_at.desc())
        .limit(500)
        .all()
    )

    result = []
    for r in rows:
        result.append({
            "po_id": str(r.po_id) if r.po_id else None,
            "event_type": r.event_type,
            "recipients": r.recipients,
            "subject": r.subject,
            "status": r.status,
            "response_message": r.response_message,
            "created_by": getattr(r, "created_by", None),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return result
