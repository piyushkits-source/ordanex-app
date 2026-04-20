from __future__ import annotations
import io
import logging
from datetime import datetime

from backend.db.database import SessionLocal
from backend.db import models
from backend.services.parser_service import parse_file_smart

logger = logging.getLogger(__name__)

def _to_upload_like(file_path: str):
    with open(file_path, "rb") as f:
        data = f.read()
    bio = io.BytesIO(data)
    bio.name = file_path.split("\\")[-1].split("/")[-1]
    return bio

def handle_upload_file_parse(file_path: str, client_id: str, environment: str):
    db = SessionLocal()
    try:
        upload_like = _to_upload_like(file_path)
        header, items_df, vendor = parse_file_smart(upload_like)

        po = models.PurchaseOrder(
            client_id=client_id,
            environment=environment,
            status="NEW",
            sender=vendor or "Customer",
            receiver=client_id,
            po_number=header.get("po_number"),
            po_date=header.get("po_date"),
            currency=header.get("currency"),
            sold_to=header.get("sold_to"),
            ship_to=header.get("ship_to"),
            received_at=datetime.utcnow(),
        )

        db.add(po)
        db.flush()

        for idx, row in enumerate(items_df.fillna("").to_dict(orient="records"), start=1):
            db.add(models.PurchaseOrderItem(
                po_id=po.po_id,
                line_no=row.get("line_no") or idx,
                material_code=row.get("material_code") or row.get("material"),
                description=row.get("description"),
                quantity=row.get("quantity") or 0,
                uom=row.get("uom") or row.get("customer_uom") or "EA",
                unit_price=row.get("unit_price") or 0,
                amount=row.get("amount") or 0,
                delivery_date=row.get("delivery_date"),
            ))

        db.commit()
        db.refresh(po)
        return po.po_id
    except Exception as e:
        logger.error(f"Upload parse failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()
