
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.core.deps import get_db, get_current_user_context, UserContext
from backend.services.outbound_service import outbound_service

router = APIRouter(prefix="/outbound", tags=["Outbound"])


@router.post("/purchase-orders/{po_id}/dispatch")
def dispatch_purchase_order(
    po_id: UUID,
    db: Session = Depends(get_db),
    user_ctx: UserContext = Depends(get_current_user_context),
) -> dict:
    return outbound_service.dispatch(db, po_id, user_ctx)
