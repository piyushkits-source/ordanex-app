
from __future__ import annotations

from pathlib import Path
from sqlalchemy.orm import Session
from backend.db import models


class InboundRuntimeService:
    def register_inbound_file(
        self,
        db: Session,
        *,
        client_id: str,
        source_channel: str,
        file_name: str,
        content: bytes,
        mime_type: str | None,
        requested_by: str | None = None,
        source_reference: str | None = None,
        extra_payload: dict | None = None,
    ) -> dict:
        storage_dir = Path("uploads") / client_id / source_channel.lower()
        storage_dir.mkdir(parents=True, exist_ok=True)
        storage_path = storage_dir / file_name
        storage_path.write_bytes(content)

        file_row = models.FileStore(
            client_id=client_id,
            original_file_name=file_name,
            mime_type=mime_type,
            file_path=str(storage_path),
            file_size_bytes=len(content),
            uploaded_by=requested_by or source_channel,
        )
        db.add(file_row)
        db.flush()

        inbound_message_id = None
        if hasattr(models, "InboundMessage"):
            inbound_message = models.InboundMessage(
                client_id=client_id,
                message_type="PO",
                source_channel=source_channel,
                source_format=mime_type or "unknown",
                source_reference=source_reference or file_name,
                sender=requested_by or source_channel,
                receiver=client_id,
                status="RECEIVED",
                raw_file_id=file_row.file_id,
            )
            db.add(inbound_message)
            db.flush()
            inbound_message_id = str(inbound_message.inbound_message_id)

        job = models.ProcessingJob(
            client_id=client_id,
            file_id=file_row.file_id,
            job_type=f"INGEST_{source_channel.upper()}",
            status="QUEUED",
            requested_by=requested_by or source_channel,
            payload_json={
                "source_channel": source_channel,
                "file_name": file_name,
                "mime_type": mime_type,
                **(extra_payload or {}),
            },
        )
        db.add(job)
        db.commit()
        db.refresh(file_row)
        db.refresh(job)
        return {
            "file_id": str(file_row.file_id),
            "job_id": str(job.job_id),
            "inbound_message_id": inbound_message_id,
            "file_path": str(storage_path),
        }


inbound_runtime_service = InboundRuntimeService()
