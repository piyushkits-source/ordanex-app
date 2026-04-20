from __future__ import annotations

import os
from celery import Celery
from celery.schedules import crontab

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)

celery_app = Celery(
    "ordanex",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
    include=[
        "backend.tasks.sftp_tasks",
        "backend.tasks.email_tasks",
        "backend.tasks.processing_tasks",
        "backend.tasks.outbound_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)

# FIX: Task names must match the `name=` argument in each @celery_app.task decorator.
# sftp_tasks uses name="backend.tasks.sftp.poll_sftp_inbound" (kept as-is from decorator)
# outbound_tasks: align with decorator name
celery_app.conf.beat_schedule = {
    "poll-sftp-inbound-every-5-min": {
        "task": "backend.tasks.sftp.poll_sftp_inbound",
        "schedule": crontab(minute="*/5"),
    },
    "poll-email-inbound-every-2-min": {
        "task": "backend.tasks.email.poll_email_inbound",
        "schedule": crontab(minute="*/2"),
    },
    "retry-failed-outbound-every-10-min": {
        "task": "backend.tasks.outbound.retry_failed_outbound",
        "schedule": crontab(minute="*/10"),
    },
}
