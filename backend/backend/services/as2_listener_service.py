
from __future__ import annotations

from sqlalchemy.orm import Session
from backend.services.inbound_runtime_service import inbound_runtime_service


class As2ListenerService:
    def receive(self, db: Session, *, client_id: str, payload: bytes, content_type: str | None, source_reference: str | None = None) -> dict:
        # Production note: add signature validation, decrypt, MIC/MDN handling here.
        return inbound_runtime_service.register_inbound_file(
            db,
            client_id=client_id,
            source_channel="AS2",
            file_name="as2_inbound_payload.dat",
            content=payload,
            mime_type=content_type or "application/octet-stream",
            requested_by="AS2",
            source_reference=source_reference or "AS2",
            extra_payload={"transport": "AS2"},
        )


as2_listener_service = As2ListenerService()
