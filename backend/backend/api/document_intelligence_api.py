
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.core.deps import get_db, get_current_user_context, UserContext
from backend.services.document_intelligence_service import document_intelligence_service

router = APIRouter(prefix="/purchase-orders", tags=["Document Intelligence"])


@router.get("/{po_id}/field-boxes")
def get_field_boxes(po_id: UUID, db: Session = Depends(get_db), user_ctx: UserContext = Depends(get_current_user_context)):
    return document_intelligence_service.get_field_boxes(db, po_id)


@router.post("/{po_id}/field-boxes")
def save_field_boxes(
    po_id: UUID,
    boxes: list[dict],
    db: Session = Depends(get_db),
    user_ctx: UserContext = Depends(get_current_user_context),
):
    return document_intelligence_service.save_field_boxes(db, po_id, boxes, user_ctx)


@router.post("/{po_id}/auto-detect")
def auto_detect(po_id: UUID, db: Session = Depends(get_db), user_ctx: UserContext = Depends(get_current_user_context)):
    return document_intelligence_service.auto_detect(db, po_id)
