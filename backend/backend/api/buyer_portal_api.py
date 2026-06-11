from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.core.deps import get_db
from fastapi import HTTPException, status
from backend.db import schemas
from backend.services.buyer_portal_service import buyer_portal_service

router = APIRouter(prefix="/buyer-portal", tags=["Buyer Portal"])


@router.get("/catalog", response_model=list[schemas.BuyerPortalCatalogItem])
def get_catalog(
    client_id: str = Query(...),
    buyer_email: str | None = Query(default=None),
    environment: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return buyer_portal_service.get_catalog(
        db,
        client_id,
        buyer_email=buyer_email,
        environment=environment,
    )


@router.post("/orders", response_model=schemas.BuyerPortalOrderRead)
def submit_order(
    payload: schemas.BuyerPortalOrderCreate,
    db: Session = Depends(get_db),
):
    result = buyer_portal_service.submit_order(db, payload)
    po = result.purchase_order
    return buyer_portal_service.get_order(db, po.po_id)


@router.post("/pricing-preview", response_model=list[schemas.BuyerPortalCatalogItem])
def pricing_preview(
    payload: schemas.BuyerPortalPricingPreviewRequest,
    db: Session = Depends(get_db),
):
    return buyer_portal_service.preview_catalog_pricing(db, payload)


@router.get("/orders", response_model=list[schemas.BuyerPortalOrderRead])
def list_orders(
    client_id: str = Query(...),
    buyer_email: str | None = Query(default=None),
    environment: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return buyer_portal_service.list_orders(
        db,
        client_id,
        buyer_email=buyer_email,
        environment=environment,
    )


@router.get("/orders/{po_id}", response_model=schemas.BuyerPortalOrderRead)
def get_order(
    po_id: UUID,
    db: Session = Depends(get_db),
):
    return buyer_portal_service.get_order(db, po_id)


@router.patch("/orders/{po_id}/commerce", response_model=schemas.BuyerPortalOrderRead)
def update_order_commerce(
    po_id: UUID,
    payload: schemas.BuyerPortalOrderCommerceUpdate,
    db: Session = Depends(get_db),
):
    return buyer_portal_service.update_order_commerce(db, po_id, payload)


@router.get("/access")
def get_access(
    client_id: str = Query(...),
    buyer_email: str | None = Query(default=None),
    environment: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return buyer_portal_service.get_access_state(
        db,
        client_id,
        buyer_email=buyer_email,
        environment=environment,
    )


@router.get("/settings")
def get_settings(
    client_id: str = Query(...),
    environment: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return buyer_portal_service.get_settings(db, client_id, environment=environment)


@router.get("/media/{file_id}")
def get_protected_media(
    file_id: UUID,
    client_id: str = Query(...),
    buyer_email: str = Query(...),
    environment: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return buyer_portal_service.get_catalog_media(
        db,
        file_id,
        client_id,
        buyer_email,
        environment=environment,
    )
