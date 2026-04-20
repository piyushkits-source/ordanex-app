from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.db.database import SessionLocal
from backend.db.schemas_monitoring import ActivityLogRead, MonitoringQueueItem, ProcessingStepRead
from backend.services.monitoring_service import monitoring_service


router = APIRouter(prefix="/monitoring", tags=["Monitoring"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/queue", response_model=list[MonitoringQueueItem])
def get_monitoring_queue(
    environment: str = Query("PROD"),
    direction: str = Query("ALL"),
    status_filter: str = Query("ALL"),
    search: str | None = Query(None),
    fromDate: str | None = Query(None),
    toDate: str | None = Query(None),
    db: Session = Depends(get_db),
):
    return monitoring_service.get_queue(
        db,
        environment=environment,
        direction=direction,
        status_filter=status_filter,
        search=search,
        from_date=fromDate,
        to_date=toDate,
    )


@router.get("/{po_id}", response_model=MonitoringQueueItem)
def get_monitoring_detail(po_id: UUID, db: Session = Depends(get_db)):
    return monitoring_service.get_detail(db, po_id)


@router.get("/{po_id}/activity-logs", response_model=list[ActivityLogRead])
def get_activity_logs(po_id: UUID, db: Session = Depends(get_db)):
    return monitoring_service.get_activity_logs(db, po_id)


@router.get("/{po_id}/processing-flow", response_model=list[ProcessingStepRead])
def get_processing_flow(po_id: UUID, db: Session = Depends(get_db)):
    return monitoring_service.get_processing_flow(db, po_id)
