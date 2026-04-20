from __future__ import annotations

from collections import Counter
from backend.core.environment import current_environment
from backend.db import models

SUCCESS_STATUSES = {"SUCCESS", "PROCESSED", "DELIVERED", "REPROCESSED"}
FAILED_STATUSES = {"ERROR", "FAILED", "DELIVERY_FAILED", "BLOCKED"}
PENDING_STATUSES = {"PENDING", "NEW", "PARSED", "CORRECTED", "PROCESSING", "REPROCESSING"}

def get_monitoring_summary(db, *, environment: str | None = None) -> dict:
    env = (environment or current_environment()).upper()
    rows = db.query(models.PurchaseOrder).all()

    filtered = []
    for row in rows:
        row_env = (getattr(row, "environment", None) or "STAGING").upper()
        if row_env == env:
            filtered.append(row)

    by_connector = Counter()
    by_status = Counter()

    for row in filtered:
        status = (getattr(row, "status", None) or "UNKNOWN").upper()
        by_status[status] += 1
        connector = (
            getattr(row, "connector_used", None)
            or getattr(row, "target_protocol", None)
            or getattr(row, "source_type", None)
            or "UNKNOWN"
        )
        by_connector[str(connector).upper()] += 1

    total = len(filtered)
    success = sum(v for k, v in by_status.items() if k in SUCCESS_STATUSES)
    failed = sum(v for k, v in by_status.items() if k in FAILED_STATUSES)
    pending = sum(v for k, v in by_status.items() if k in PENDING_STATUSES)

    return {
        "environment": env,
        "total": total,
        "success": success,
        "failed": failed,
        "pending": pending,
        "by_connector": dict(by_connector),
        "by_status": dict(by_status),
    }
