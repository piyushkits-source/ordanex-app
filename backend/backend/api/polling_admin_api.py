
from __future__ import annotations

from fastapi import APIRouter
from backend.tasks.sftp_tasks import poll_sftp_inbound
from backend.tasks.email_tasks import poll_email_inbound
from backend.tasks.outbound_tasks import retry_failed_outbound

router = APIRouter(prefix="/polling-admin", tags=["Polling Admin"])


@router.post("/run/sftp")
def run_sftp_poll() -> dict:
    task = poll_sftp_inbound.delay()
    return {"status": "QUEUED", "task_id": task.id, "task": "sftp_poll"}


@router.post("/run/email")
def run_email_poll() -> dict:
    task = poll_email_inbound.delay()
    return {"status": "QUEUED", "task_id": task.id, "task": "email_poll"}


@router.post("/run/retry-outbound")
def run_retry_outbound() -> dict:
    task = retry_failed_outbound.delay()
    return {"status": "QUEUED", "task_id": task.id, "task": "retry_outbound"}
