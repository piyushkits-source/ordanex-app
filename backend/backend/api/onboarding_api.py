from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.services.customer_onboarding_service import build_lightweight_onboarding_result

router = APIRouter(prefix="/onboarding", tags=["Lightweight Onboarding"])


@router.post("/cluster-preview")
def cluster_preview(payload: dict, db: Session = Depends(get_db)):
    parsed_docs = payload.get("parsed_docs", []) or []
    client_id = payload.get("client_id")
    sold_to = payload.get("sold_to")
    ship_to = payload.get("ship_to")
    similarity_threshold = float(payload.get("similarity_threshold", 0.72))

    return build_lightweight_onboarding_result(
        db,
        parsed_docs,
        client_id=client_id,
        sold_to=sold_to,
        ship_to=ship_to,
        similarity_threshold=similarity_threshold,
    )