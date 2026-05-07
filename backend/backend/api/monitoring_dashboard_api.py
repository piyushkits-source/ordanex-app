from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.services.monitoring_dashboard_service import get_monitoring_summary
from backend.services.rbac import get_current_user, UserContext

router = APIRouter(prefix="/monitoring-dashboard", tags=["monitoring-dashboard"])


@router.get("/filters")
def monitoring_filters(
    client_id: str | None = Query(default=None),
    vertical_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user_ctx: UserContext = Depends(get_current_user),
):
    from backend.db import models

    role = str(getattr(user_ctx, "role", "") or "").lower()
    effective_client_id = client_id
    if role != "super_admin":
        effective_client_id = getattr(user_ctx, "client_id", None)

    clients_query = db.query(models.Client).order_by(models.Client.client_name.asc())
    if effective_client_id:
        clients_query = clients_query.filter(models.Client.client_id == effective_client_id)

    verticals = []
    if effective_client_id:
        verticals = (
            db.query(models.BusinessVertical)
            .filter(models.BusinessVertical.client_id == effective_client_id)
            .order_by(models.BusinessVertical.vertical_name.asc())
            .all()
        )

    partners_query = db.query(models.TradingPartner).order_by(models.TradingPartner.partner_name.asc())
    if effective_client_id:
        partners_query = partners_query.filter(models.TradingPartner.client_id == effective_client_id)
    if vertical_id:
        partners_query = partners_query.filter(models.TradingPartner.vertical_id == vertical_id)

    return {
        "role": role,
        "effective_client_id": effective_client_id,
        "clients": [
            {"client_id": row.client_id, "client_name": row.client_name}
            for row in clients_query.all()
        ],
        "verticals": [
            {
                "vertical_id": str(row.vertical_id),
                "vertical_code": row.vertical_code,
                "vertical_name": row.vertical_name,
            }
            for row in verticals
        ],
        "partners": [
            {
                "partner_id": str(row.partner_id),
                "partner_code": row.partner_code,
                "partner_name": row.partner_name,
                "vertical_id": str(row.vertical_id) if row.vertical_id else None,
            }
            for row in partners_query.all()
        ],
    }


@router.get("/summary")
def monitoring_summary(
    environment: str | None = Query(default=None),
    client_id: str | None = Query(default=None),
    vertical_id: str | None = Query(default=None),
    partner_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user_ctx: UserContext = Depends(get_current_user),
):
    role = str(getattr(user_ctx, "role", "") or "").lower()
    effective_client_id = client_id
    if role != "super_admin":
        effective_client_id = getattr(user_ctx, "client_id", None)

    return get_monitoring_summary(
        db,
        environment=environment,
        client_id=effective_client_id,
        vertical_id=vertical_id,
        partner_id=partner_id,
    )
