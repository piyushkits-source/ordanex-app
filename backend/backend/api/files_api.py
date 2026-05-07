from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from PIL import Image
import pytesseract

from backend.db.database import get_db
from backend.db import models, schemas

router = APIRouter(prefix="/files", tags=["Files"])


class OcrRegionRequest(BaseModel):
    x: float
    y: float
    width: float
    height: float
    page: int | None = 1


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

    normalized = raw_path.replace("\\", "/")
    abs_path = Path(normalized)
    if not abs_path.is_absolute():
        abs_path = Path.cwd() / abs_path

    abs_path = abs_path.resolve()
    if not abs_path.exists():
        raise HTTPException(status_code=410, detail="Original document no longer available")

    return file_row, abs_path


def _clean_ocr_text(text: str | None) -> str:
    return " ".join((text or "").strip().split())


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
        file_row, abs_path = _resolve_file_row(file_id, db)
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
    display_name = file_row.original_file_name or abs_path.name

    response = FileResponse(
        path=str(abs_path),
        media_type=media_type,
    )
    response.headers["Content-Disposition"] = f'inline; filename="{display_name}"'
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@router.post("/{file_id}/ocr-region")
def ocr_file_region(file_id: str, payload: OcrRegionRequest, db: Session = Depends(get_db)):
    file_row, abs_path = _resolve_file_row(file_id, db)
    mime = str(file_row.mime_type or "").lower()
    name = str(file_row.original_file_name or abs_path.name or "").lower()

    if not (
        mime.startswith("image/")
        or name.endswith((".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tif", ".tiff", ".jfif"))
    ):
        raise HTTPException(status_code=400, detail="OCR region extraction is supported only for image files")

    try:
        image = Image.open(abs_path).convert("RGB")
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
