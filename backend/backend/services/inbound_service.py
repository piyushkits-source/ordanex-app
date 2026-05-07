
from __future__ import annotations

from io import BytesIO
from pathlib import Path


def _short_source_format(file_name: str | None, mime_type: str | None) -> str:
    mime = (mime_type or "").lower().strip()
    mime_map = {
        "application/pdf": "PDF",
        "application/vnd.ms-excel": "EXCEL",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "EXCEL",
        "text/csv": "CSV",
        "text/plain": "TXT",
        "application/xml": "XML",
        "text/xml": "XML",
        "application/json": "JSON",
        "application/x-x12": "X12",
        "application/edifact": "EDIFACT",
        "image/png": "IMAGE",
        "image/jpeg": "IMAGE",
        "image/jpg": "IMAGE",
        "image/tiff": "IMAGE",
        "application/msword": "WORD",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "WORD",
        "text/html": "HTML",
    }
    if mime in mime_map:
        return mime_map[mime]

    ext = Path(file_name or "").suffix.lower().lstrip(".")
    ext_map = {
        "pdf": "PDF",
        "xls": "EXCEL",
        "xlsx": "EXCEL",
        "csv": "CSV",
        "txt": "TXT",
        "xml": "XML",
        "json": "JSON",
        "x12": "X12",
        "edi": "EDIFACT",
        "edifact": "EDIFACT",
        "png": "IMAGE",
        "jpg": "IMAGE",
        "jpeg": "IMAGE",
        "tif": "IMAGE",
        "tiff": "IMAGE",
        "doc": "WORD",
        "docx": "WORD",
        "html": "HTML",
        "htm": "HTML",
    }
    return ext_map.get(ext, "UNKNOWN")

from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from backend.db import models
from backend.core.deps import UserContext


class InboundService:
    allowed_types = {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/csv",
        "text/plain",
        "application/xml",
        "application/json",
        "application/octet-stream",  # X12, EDIFACT, generic uploads
        "application/x-x12",
        "application/edifact",
        "application/pdf",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }

    def receive_upload(self, db: Session, *, file: UploadFile, client_id: str, user_ctx: UserContext) -> dict:
        if file.content_type and file.content_type not in self.allowed_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type: {file.content_type}",
            )

        contents = file.file.read()
        if not contents:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

        storage_dir = Path("uploads") / client_id
        storage_dir.mkdir(parents=True, exist_ok=True)
        storage_path = storage_dir / file.filename
        storage_path.write_bytes(contents)

        file_row = models.FileStore(
            client_id=client_id,
            original_file_name=file.filename,
            mime_type=file.content_type,
            file_path=str(storage_path),
            file_size_bytes=len(contents),
            uploaded_by=user_ctx.email,
        )
        db.add(file_row)
        db.flush()

        inbound_message = None
        if hasattr(models, "InboundMessage"):
            inbound_message = models.InboundMessage(
                client_id=client_id,
                message_type="PO",
                source_channel="UPLOAD",
                source_format=_short_source_format(file.filename, file.content_type),
                source_reference=file.filename,
                sender=user_ctx.email,
                receiver=client_id,
                status="RECEIVED",
                raw_file_id=file_row.file_id,
            )
            db.add(inbound_message)
            db.flush()

        job = models.ProcessingJob(
            client_id=client_id,
            file_id=file_row.file_id,
            job_type="INGEST_UPLOAD",
            status="QUEUED",
            requested_by=user_ctx.email,
            payload_json={
                "source_channel": "UPLOAD",
                "file_name": file.filename,
                "mime_type": file.content_type,
            },
        )
        db.add(job)
        db.commit()
        db.refresh(file_row)
        db.refresh(job)
        if inbound_message:
            db.refresh(inbound_message)

        return {
            "status": "RECEIVED",
            "client_id": client_id,
            "file_id": str(file_row.file_id),
            "job_id": str(job.job_id),
            "inbound_message_id": str(inbound_message.inbound_message_id) if inbound_message else None,
            "file_name": file.filename,
        }


inbound_service = InboundService()
