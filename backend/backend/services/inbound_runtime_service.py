
from __future__ import annotations

from uuid import UUID
from pathlib import Path
from sqlalchemy.orm import Session
from backend.db import models


class InboundRuntimeService:
    def _infer_message_type(self, file_name: str, source_reference: str | None, extra_payload: dict | None) -> str:
        text = " ".join(
            str(part or "").lower()
            for part in (
                file_name,
                source_reference,
                (extra_payload or {}).get("subject"),
                (extra_payload or {}).get("message_type"),
            )
        )

        explicit = str((extra_payload or {}).get("message_type") or "").strip().upper()
        if explicit in {"PO", "ORDERS", "ORDER", "ORDER_RESPONSE", "ORDER_CHANGE", "ASN", "INVOICE"}:
            if explicit == "ORDER":
                return "PO"
            return explicit

        if any(token in text for token in ("invoice", "billing", "ap invoice", "ar invoice")):
            return "INVOICE"
        if any(token in text for token in ("asn", "desadv", "delivery note", "shipment advice")):
            return "ASN"
        if any(token in text for token in ("order response", "order confirmation", "acknowledg", "ordrsp")):
            return "ORDER_RESPONSE"
        if any(token in text for token in ("order change", "change order", "amendment")):
            return "ORDER_CHANGE"
        return "PO"

    def _json_safe(self, value):
        if isinstance(value, UUID):
            return str(value)
        if isinstance(value, dict):
            return {str(k): self._json_safe(v) for k, v in value.items()}
        if isinstance(value, list):
            return [self._json_safe(v) for v in value]
        if isinstance(value, tuple):
            return [self._json_safe(v) for v in value]
        return value

    def _truncate(self, value: str | None, max_len: int = 50) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        return text[:max_len]

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
            inferred_message_type = self._infer_message_type(file_name, source_reference, extra_payload)
            inbound_message = models.InboundMessage(
                client_id=client_id,
                message_type=inferred_message_type,
                source_channel=source_channel,
                source_format=mime_type or "unknown",
                source_reference=self._truncate(source_reference or file_name),
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
            payload_json=self._json_safe({
                "source_channel": source_channel,
                "file_name": file_name,
                "mime_type": mime_type,
                **(extra_payload or {}),
            }),
        )
        db.add(job)
        db.commit()
        db.refresh(file_row)
        db.refresh(job)

        # Kick the processing worker so inbound files are promoted into the
        # document/monitor flow immediately after registration.
        try:
            from backend.tasks.processing_tasks import process_job

            process_job.delay(str(job.job_id))
        except Exception:
            pass

        return {
            "file_id": str(file_row.file_id),
            "job_id": str(job.job_id),
            "inbound_message_id": inbound_message_id,
            "file_path": str(storage_path),
        }


inbound_runtime_service = InboundRuntimeService()
