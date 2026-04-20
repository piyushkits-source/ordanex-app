
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from backend.core.deps import get_db, get_current_user_context, UserContext
from backend.services.inbound_service import inbound_service

router = APIRouter(prefix="/inbound", tags=["Inbound"])


@router.post("/upload")
def upload_inbound_file(
    client_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_ctx: UserContext = Depends(get_current_user_context),
) -> dict:
    return inbound_service.receive_upload(db, file=file, client_id=client_id, user_ctx=user_ctx)


@router.post("/api")
def receive_api_payload(payload: dict, user_ctx: UserContext = Depends(get_current_user_context)) -> dict:
    # Placeholder route for customer/system API ingestion.
    return {
        "status": "ACCEPTED",
        "source_channel": "API",
        "client_id": user_ctx.client_id,
        "payload_preview_keys": sorted(payload.keys()),
    }
