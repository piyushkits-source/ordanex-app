
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from backend.core.deps import get_db
from backend.services.as2_listener_service import as2_listener_service

router = APIRouter(prefix="/as2", tags=["AS2 Inbound"])


@router.post("/inbound/{client_id}")
async def receive_as2_message(
    client_id: str,
    request: Request,
    db: Session = Depends(get_db),
    as2_from: str | None = Header(default=None, alias="AS2-From"),
    message_id: str | None = Header(default=None, alias="Message-Id"),
):
    payload = await request.body()
    result = as2_listener_service.receive(
        db,
        client_id=client_id,
        payload=payload,
        content_type=request.headers.get("content-type"),
        source_reference=message_id or as2_from,
    )
    return {"status": "RECEIVED", **result}
