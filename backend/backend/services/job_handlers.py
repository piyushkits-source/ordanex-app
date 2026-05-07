from __future__ import annotations
import io
import json
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

def handle_upload_file_parse(
    file_path: str | None = None,
    client_id: str = "",
    environment: str = "PROD",
    file_id: str | None = None,
    job_id: str | None = None,
    source_type: str | None = None,
    requested_by: str | None = None,
    **kwargs,
):
    db = SessionLocal()
    try:
        if not file_path:
            if not file_id:
                if job_id:
                    job_row = db.query(models.ProcessingJob).filter(models.ProcessingJob.job_id == job_id).first()
                    if not job_row:
                        raise ValueError(f"Job {job_id} not found")
                    file_id = str(job_row.file_id) if job_row.file_id else None
                if not file_id:
                    raise ValueError("Either file_path, file_id, or job_id must be provided")
            file_row = db.query(models.FileStore).filter(models.FileStore.file_id == file_id).first()
            if not file_row:
                raise ValueError(f"File {file_id} not found")
            file_path = file_row.file_path

        upload_like = _to_upload_like(file_path)
        header, items_df, vendor = parse_file_smart(upload_like)

        document_type = str(
            header.get("document_type")
            or header.get("po_type")
            or "PO"
        ).strip().upper()
        is_invoice = document_type == "INVOICE"
        invoice_number = header.get("invoice_number")
        invoice_date = header.get("invoice_date")
        reference_po_number = header.get("reference_po_number") or header.get("po_number")
        document_number = (
            invoice_number
            if is_invoice and invoice_number
            else header.get("po_number")
            or header.get("document_number")
            or reference_po_number
        )

        normalized_header = {
            "document_type": document_type,
            "message_family": document_type,
            "message_type": header.get("message_type") or ("810" if document_type == "INVOICE" and str(source_type or "").upper() == "X12" else "INVOIC" if document_type == "INVOICE" and str(source_type or "").upper() == "EDIFACT" else "INVOICE" if document_type == "INVOICE" else "ORDERS"),
            "document_number": document_number,
            "invoice_number": invoice_number,
            "invoice_date": invoice_date,
            "reference_po_number": reference_po_number,
            "po_number": header.get("po_number"),
            "po_date": header.get("po_date"),
            "currency": header.get("currency"),
            "supplier": header.get("supplier") or vendor,
            "vendor": header.get("vendor") or vendor,
            "detected_format": source_type,
        }

        po = models.PurchaseOrder(
            client_id=client_id,
            environment=environment,
            status="NEW",
            sender=requested_by or vendor or header.get("supplier") or "Customer",
            receiver=client_id,
            file_id=file_id,
            job_id=job_id,
            po_number=document_number,
            original_po_number=reference_po_number,
            docnum=invoice_number or document_number,
            po_date=invoice_date or header.get("po_date"),
            currency=header.get("currency"),
            sold_to=header.get("sold_to"),
            ship_to=header.get("ship_to"),
            po_type=document_type,
            order_type=header.get("order_type"),
            received_at=datetime.utcnow(),
            header_details=json.dumps(normalized_header, default=str),
            po_confidence=header.get("document_confidence") or header.get("confidence"),
            po_validation_reason=header.get("document_confidence_reason") or header.get("confidence_reason"),
            mapping_resolution_json={
                "header": normalized_header,
                "document_type": document_type,
                "message_family": normalized_header.get("message_family"),
                "message_type": normalized_header.get("message_type"),
                "confidence": header.get("document_confidence") or header.get("confidence"),
                "confidence_reason": header.get("document_confidence_reason") or header.get("confidence_reason"),
                "detected_format": source_type,
            },
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
                delivery_date=row.get("delivery_date") or None,
            ))

        db.commit()
        db.refresh(po)
        return po.po_id
    except Exception as e:
        logger.exception(f"Upload parse failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()
