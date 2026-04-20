from pathlib import Path
import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db import models, schemas

router = APIRouter(prefix="/files", tags=["Files"])

@router.get("/by-po/{po_id}", response_model=schemas.PoFileInfoResponse)
def get_file_by_po(po_id: str, db: Session = Depends(get_db)):
    po = (
        db.query(models.PurchaseOrder)
        .filter(models.PurchaseOrder.po_id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    file_row = (
        db.query(models.FileStore)
        .filter(models.FileStore.file_id == po.file_id)
        .first()
        if po.file_id
        else None
    )

    return schemas.PoFileInfoResponse(
        po_id=po.po_id,
        po_number=po.po_number,
        file=file_row,
    )


@router.get("/{file_id}/download")
def download_file(file_id: str, db: Session = Depends(get_db)):
    file_row = (
        db.query(models.FileStore)
        .filter(models.FileStore.file_id == file_id)
        .first()
    )

    if not file_row:
        raise HTTPException(status_code=404, detail=f"File not found for file_id={file_id}")

    raw_path = str(file_row.file_path or "").strip()
    if not raw_path:
        raise HTTPException(status_code=404, detail=f"File path empty for file_id={file_id}")

    normalized = raw_path.replace("\\", "/")
    abs_path = Path(normalized)
    if not abs_path.is_absolute():
        abs_path = Path.cwd() / abs_path

    abs_path = abs_path.resolve()

    if not abs_path.exists():
        return JSONResponse(
        status_code=410,
        content={
            "error": "FILE_UNAVAILABLE",
            "message": "Original document no longer available (migrated record). PO metadata is still accessible.",
            "file_id": file_id,
            "original_name": file_row.original_file_name,
        },
    )

    media_type = file_row.mime_type or "application/pdf"
    display_name = file_row.original_file_name or abs_path.name

    response = FileResponse(
        path=str(abs_path),
        media_type=media_type,
    )
    response.headers["Content-Disposition"] = f'inline; filename="{display_name}"'
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
