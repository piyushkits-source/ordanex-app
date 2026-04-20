from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.services.monitoring_dashboard_service import get_monitoring_summary

router = APIRouter(prefix="/monitoring-dashboard", tags=["monitoring-dashboard"])

@router.get("/summary")
def monitoring_summary(
    environment: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return get_monitoring_summary(db, environment=environment)
