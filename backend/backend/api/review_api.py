
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.core.deps import get_db, get_current_user_context, UserContext
from backend.db import schemas
from backend.services.review_service import review_service

router = APIRouter(prefix="/review", tags=["Review"])


@router.get("/queue", response_model=list[schemas.PurchaseOrderRead])
def review_queue(
    db: Session = Depends(get_db),
    user_ctx: UserContext = Depends(get_current_user_context),
):
    return review_service.get_review_queue(db, client_id=user_ctx.client_id)


@router.post("/{po_id}/save-corrections", response_model=schemas.PurchaseOrderRead)
def save_corrections(
    po_id: UUID,
    payload: schemas.PurchaseOrderUpdate,
    db: Session = Depends(get_db),
    user_ctx: UserContext = Depends(get_current_user_context),
):
    return review_service.save_corrections(db, po_id, payload, user_ctx)


@router.post("/{po_id}/approve", response_model=schemas.PurchaseOrderRead)
def approve_po(
    po_id: UUID,
    db: Session = Depends(get_db),
    user_ctx: UserContext = Depends(get_current_user_context),
):
    return review_service.approve(db, po_id, user_ctx)
