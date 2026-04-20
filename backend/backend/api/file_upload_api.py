from __future__ import annotations

import io

from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db import models
from backend.services.file_storage_service import save_uploaded_file
from backend.services.po_parser_hybrid import parse_pdf_ai_structured
from backend.services.upload_orchestrator import process_parsed_po_upload

# keep RBAC only if your auth is working; otherwise remove these two imports
from backend.services.rbac import get_current_user, enforce_client_scope

router = APIRouter(prefix="/file-upload", tags=["File Upload"])


@router.post("/")
async def upload_file_and_process(
    client_id: str = Form(...),
    uploaded_by: str = Form("streamlit_user"),
    environment: str = Form("PROD"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),  # remove if auth is still disabled
):
    # remove this line too if auth is still disabled
    enforce_client_scope(current_user, client_id)

    if not file:
        raise HTTPException(status_code=400, detail="No file provided")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    # ---------------------------------------
    # 1. SAVE FILE
    # ---------------------------------------
    saved = save_uploaded_file(
        client_id=client_id,
        original_file_name=file.filename,
        file_bytes=file_bytes,
    )

    file_row = models.FileStore(
        client_id=client_id,
        original_file_name=file.filename,
        mime_type=file.content_type,
        file_path=saved["file_path"],
        file_size_bytes=saved["file_size_bytes"],
        uploaded_by=uploaded_by,
        checksum=saved["checksum"],
    )

    db.add(file_row)
    db.commit()
    db.refresh(file_row)

    # ---------------------------------------
    # 2. PARSE FILE
    # ---------------------------------------
    file_like = io.BytesIO(file_bytes)
    file_like.name = file.filename or "uploaded_file.pdf"

    parsed_data = parse_pdf_ai_structured(file_like)

    # ---------------------------------------
    # 3. CREATE DOCUMENT / PO
    # ---------------------------------------
    created_by = (
        getattr(current_user, "email", None)
        if current_user is not None
        else uploaded_by
    ) or uploaded_by

    po = process_parsed_po_upload(
        db=db,
        client_id=client_id,
        parsed_data=parsed_data,
        created_by=created_by,
        environment=environment,
        file_id=str(file_row.file_id),
    )

    return {
        "status": "SUCCESS",
        "message": "File uploaded and document created successfully",
        "po_id": str(po.po_id),
        "document_number": po.docnum or po.po_number,
        "po_number": po.po_number,
        "file_id": str(file_row.file_id),
        "environment": environment,
    }