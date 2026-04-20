
from __future__ import annotations

from backend.celery_app import celery_app
from backend.db.database import SessionLocal
from backend.services.email_polling_service import email_polling_service


print("### EMAIL TASK FILE LOADED ###")

@celery_app.task(name="backend.tasks.email.poll_email_inbound")
def poll_email_inbound() -> dict:
    print("### TASK EXECUTING ###")
    db = SessionLocal()
    try:
        return email_polling_service.poll_all(db)
    finally:
        db.close()
