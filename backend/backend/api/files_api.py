import re
from io import BytesIO
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from PIL import Image
import pytesseract

from backend.db.database import get_db
from backend.db import models, schemas
from backend.services.file_storage_service import (
    is_s3_storage_path,
    read_stored_file,
    resolve_local_file_path,
    save_uploaded_file,
)

router = APIRouter(prefix="/files", tags=["Files"])

PortalUploadScope = Literal[
    "catalog-media",
    "payment-proof",
    "invoice-document",
    "shipment-document",
]

MAX_BYTES_BY_SCOPE: dict[str, int] = {
    "catalog-media": 25 * 1024 * 1024,
    "payment-proof": 8 * 1024 * 1024,
    "invoice-document": 12 * 1024 * 1024,
    "shipment-document": 12 * 1024 * 1024,
}


class OcrRegionRequest(BaseModel):
    x: float
    y: float
    width: float
    height: float
    page: int | None = 1


class PortalUploadResponse(BaseModel):
    file_id: str
    file_name: str
    file_url: str
    storage_key: str | None = None
    content_type: str
    scope: PortalUploadScope
    client_id: str
    order_id: str | None = None
    product_sku: str | None = None


def _safe_token(value: str | None, fallback: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "-", str(value or "").strip()).strip("-")
    return cleaned or fallback


def _validate_portal_upload(scope: PortalUploadScope, upload: UploadFile, file_bytes: bytes) -> None:
    size_limit = MAX_BYTES_BY_SCOPE[scope]
    if len(file_bytes) > size_limit:
        raise HTTPException(
            status_code=413,
            detail=f"Upload failed because the file exceeded the {size_limit // (1024 * 1024)}MB limit.",
        )

    content_type = str(upload.content_type or "").lower()
    file_name = str(upload.filename or "").lower()
    if scope == "catalog-media":
        if (
            content_type.startswith("image/")
            or content_type.startswith("video/")
            or file_name.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm", ".ogg"))
        ):
            return
        raise HTTPException(status_code=400, detail="Catalog media must be an image or video.")

    if (
        content_type == "application/pdf"
        or content_type.startswith("image/")
        or file_name.endswith((".pdf", ".png", ".jpg", ".jpeg", ".webp"))
    ):
        return
    raise HTTPException(status_code=400, detail="This upload must be a PDF or image.")


def _build_portal_subdir(
    scope: PortalUploadScope,
    *,
    order_id: str | None,
    product_sku: str | None,
) -> str:
    if scope == "catalog-media":
        return f"portal/catalog/{_safe_token(product_sku, 'unscoped-product')}"
    if scope == "payment-proof":
        return f"portal/orders/{_safe_token(order_id, 'unscoped-order')}/payment-proof"
    if scope == "invoice-document":
        return f"portal/orders/{_safe_token(order_id, 'unscoped-order')}/invoice"
    return f"portal/orders/{_safe_token(order_id, 'unscoped-order')}/shipment"


def _resolve_file_row(file_id: str, db: Session):
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

    if is_s3_storage_path(raw_path):
        return file_row, {"mode": "s3", "reference": raw_path}

    abs_path = resolve_local_file_path(raw_path)
    if not abs_path.exists():
        raise HTTPException(status_code=410, detail="Original document no longer available")

    return file_row, {"mode": "local", "path": abs_path}


def _clean_ocr_text(text: str | None) -> str:
    return " ".join((text or "").strip().split())


@router.post("/upload", response_model=PortalUploadResponse)
async def upload_portal_file(
    client_id: str = Form(...),
    scope: PortalUploadScope = Form(...),
    order_id: str | None = Form(default=None),
    product_sku: str | None = Form(default=None),
    uploaded_by: str = Form(default="portal_user"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    _validate_portal_upload(scope, file, file_bytes)
    subdir = _build_portal_subdir(scope, order_id=order_id, product_sku=product_sku)
    saved = save_uploaded_file(
        client_id=client_id,
        original_file_name=file.filename or "upload.bin",
        file_bytes=file_bytes,
        subdir=subdir,
    )

    file_row = models.FileStore(
        client_id=client_id,
        original_file_name=file.filename or "upload.bin",
        mime_type=file.content_type or "application/octet-stream",
        source_channel=f"PORTAL_{str(scope).upper().replace('-', '_')}",
        file_path=saved["file_path"],
        file_size_bytes=saved["file_size_bytes"],
        uploaded_by=uploaded_by,
        checksum=saved["checksum"],
    )
    db.add(file_row)
    db.commit()
    db.refresh(file_row)

    return PortalUploadResponse(
        file_id=str(file_row.file_id),
        file_name=file_row.original_file_name,
        file_url=f"/files/{file_row.file_id}/download",
        storage_key=saved.get("storage_key"),
        content_type=file_row.mime_type or "application/octet-stream",
        scope=scope,
        client_id=client_id,
        order_id=order_id,
        product_sku=product_sku,
    )


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
    try:
        file_row, storage_ref = _resolve_file_row(file_id, db)
    except HTTPException as exc:
        if exc.status_code != 410:
            raise
        return JSONResponse(
            status_code=410,
            content={
                "error": "FILE_UNAVAILABLE",
                "message": "Original document no longer available (migrated record). PO metadata is still accessible.",
                "file_id": file_id,
                "original_name": None,
            },
        )

    media_type = file_row.mime_type or "application/pdf"
    display_name = file_row.original_file_name or "downloaded-file"

    if storage_ref["mode"] == "s3":
        try:
            file_bytes = read_stored_file(storage_ref["reference"])
        except FileNotFoundError:
            return JSONResponse(
                status_code=410,
                content={
                    "error": "FILE_UNAVAILABLE",
                    "message": "Original document no longer available (migrated record). PO metadata is still accessible.",
                    "file_id": file_id,
                    "original_name": display_name,
                },
            )
        response = Response(content=file_bytes, media_type=media_type)
    else:
        abs_path = storage_ref["path"]
        if not display_name:
            display_name = abs_path.name
        response = FileResponse(
            path=str(abs_path),
            media_type=media_type,
        )

    response.headers["Content-Disposition"] = f'inline; filename="{display_name}"'
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@router.post("/{file_id}/ocr-region")
def ocr_file_region(file_id: str, payload: OcrRegionRequest, db: Session = Depends(get_db)):
    file_row, storage_ref = _resolve_file_row(file_id, db)
    display_name = str(file_row.original_file_name or "uploaded-file")
    mime = str(file_row.mime_type or "").lower()
    name = display_name.lower()

    if not (
        mime.startswith("image/")
        or name.endswith((".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tif", ".tiff", ".jfif"))
    ):
        raise HTTPException(status_code=400, detail="OCR region extraction is supported only for image files")

    try:
        if storage_ref["mode"] == "s3":
            image = Image.open(BytesIO(read_stored_file(storage_ref["reference"]))).convert("RGB")
        else:
            image = Image.open(storage_ref["path"]).convert("RGB")
        width, height = image.size

        x0 = max(0, min(width, int((payload.x or 0) * width)))
        y0 = max(0, min(height, int((payload.y or 0) * height)))
        x1 = max(x0 + 1, min(width, int(((payload.x or 0) + (payload.width or 0)) * width)))
        y1 = max(y0 + 1, min(height, int(((payload.y or 0) + (payload.height or 0)) * height)))

        crop = image.crop((x0, y0, x1, y1))
        buffer = BytesIO()
        crop.save(buffer, format="PNG")
        buffer.seek(0)

        text = _clean_ocr_text(
            pytesseract.image_to_string(Image.open(buffer), config="--oem 3 --psm 6")
        )
        return {"text": text, "bbox": payload.model_dump(), "file_id": file_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OCR region extraction failed: {exc}")
