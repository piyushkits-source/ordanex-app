from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, Query, HTTPException, status, Response
from sqlalchemy.orm import Session

from backend.core.deps import get_db, get_current_user_context, UserContext
from backend.db import schemas
from backend.services.purchase_order_service import purchase_order_service

router = APIRouter(prefix="/purchase-orders", tags=["Purchase Orders"])


# ============================================================
# LIST
# ============================================================
@router.get("/", response_model=list[schemas.PurchaseOrderRead])
def list_purchase_orders(
    client_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user_ctx: UserContext = Depends(get_current_user_context),
):
    effective_client_id = client_id or user_ctx.client_id
    return purchase_order_service.list_purchase_orders(
        db,
        client_id=effective_client_id,
        status_filter=status,
    )


# ============================================================
# GET SINGLE
# ============================================================
@router.get("/{po_id}", response_model=schemas.PurchaseOrderRead)
def get_purchase_order(
    po_id: UUID,
    db: Session = Depends(get_db),
    user_ctx: UserContext = Depends(get_current_user_context),
):
    return purchase_order_service.get_purchase_order(db, po_id)


# ============================================================
# UPDATE (Manual Correction)
# ============================================================
@router.put("/{po_id}", response_model=schemas.PurchaseOrderRead)
def update_purchase_order(
    po_id: UUID,
    payload: schemas.PurchaseOrderUpdate,
    db: Session = Depends(get_db),
    user_ctx: UserContext = Depends(get_current_user_context),
):
    return purchase_order_service.update_purchase_order(
        db,
        po_id,
        payload,
        user_ctx,
    )


# ============================================================
# PROCESS (MAIN PIPELINE)
# ============================================================
@router.post("/{po_id}/process", response_model=schemas.ReprocessResponse)
def process_purchase_order(
    po_id: UUID,
    db: Session = Depends(get_db),
    user_ctx: UserContext = Depends(get_current_user_context),
):
    return purchase_order_service.process_purchase_order(
        db,
        po_id,
        user_ctx,
    )


# ============================================================
# REPROCESS (DEFAULT)
# ============================================================
@router.post("/{po_id}/reprocess", response_model=schemas.ReprocessResponse)
def reprocess_purchase_order(
    po_id: UUID,
    payload: schemas.ReprocessRequest | None = None,
    db: Session = Depends(get_db),
    user_ctx: UserContext = Depends(get_current_user_context),
):
    return purchase_order_service.reprocess_purchase_order(
        db,
        po_id,
        user_ctx,
    )


# ============================================================
# 🔥 ADVANCED REPROCESS (FLOW OVERRIDE)
# ============================================================
@router.post("/{po_id}/reprocess-advanced", response_model=schemas.ReprocessResponse)
def reprocess_advanced(
    po_id: UUID,
    payload: schemas.ReprocessRequest,
    db: Session = Depends(get_db),
    user_ctx: UserContext = Depends(get_current_user_context),
):
    """
    Allows overriding:
    - ERP
    - Message type
    - Version
    - Connection
    """
    return purchase_order_service.reprocess_with_override(
        db,
        po_id,
        payload,
        user_ctx,
    )


# ============================================================
# 🚀 RETRY DELIVERY ONLY (NO REPROCESS)
# ============================================================
@router.post("/{po_id}/retry-delivery")
def retry_delivery(
    po_id: UUID,
    db: Session = Depends(get_db),
    user_ctx: UserContext = Depends(get_current_user_context),
):
    return purchase_order_service.retry_delivery(
        db,
        po_id,
        user_ctx,
    )


# ============================================================
# ARCHIVE
# ============================================================
@router.post("/{po_id}/archive")
def archive_purchase_order(
    po_id: UUID,
    payload: dict,
    db: Session = Depends(get_db),
    user_ctx: UserContext = Depends(get_current_user_context),
):
    reason = str(payload.get("reason") or "").strip()
    comment = str(payload.get("comment") or "").strip() or None

    if not reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archive reason is required.",
        )

    return purchase_order_service.archive_purchase_order(
        db,
        po_id,
        reason,
        comment,
        user_ctx,
    )


# ============================================================
# 📥 DOWNLOAD CANONICAL (JSON)
# ============================================================
@router.get("/{po_id}/download/canonical")
def download_canonical(
    po_id: UUID,
    db: Session = Depends(get_db),
):
    po = purchase_order_service.get_purchase_order(db, po_id)

    if not po.canonical_json:
        raise HTTPException(status_code=404, detail="Canonical not found")

    return po.canonical_json


# ============================================================
# 📥 DOWNLOAD TARGET PAYLOAD
# ============================================================
@router.get("/{po_id}/download/target")
def download_target(
    po_id: UUID,
    db: Session = Depends(get_db),
):
    po = purchase_order_service.get_purchase_order(db, po_id)

    if getattr(po, "xml_payload", None):
        return Response(
            content=po.xml_payload,
            media_type="application/xml",
            headers={
                "Content-Disposition": f"attachment; filename={po.po_number or po.po_id}.xml"
            },
        )

    if getattr(po, "target_payload_json", None):
        return po.target_payload_json

    raise HTTPException(status_code=404, detail="No target payload found")