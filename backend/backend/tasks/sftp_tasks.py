
from __future__ import annotations

from backend.celery_app import celery_app
from backend.db.database import SessionLocal
from backend.services.sftp_polling_service import sftp_polling_service


@celery_app.task(name="backend.tasks.sftp.poll_sftp_inbound")
def poll_sftp_inbound() -> dict:
    db = SessionLocal()
    try:
        return sftp_polling_service.poll_all(db)
    finally:
        db.close()
