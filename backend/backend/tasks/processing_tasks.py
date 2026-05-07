
from __future__ import annotations

from backend.celery_app import celery_app
from backend.db.database import SessionLocal
from backend.db import models
from backend.services.job_handlers import handle_upload_file_parse


@celery_app.task(name="backend.tasks.processing.process_job")
def process_job(job_id: str) -> dict:
    db = SessionLocal()
    try:
        po_ids = []
        primary_po_id = None
        job = db.query(models.ProcessingJob).filter(models.ProcessingJob.job_id == job_id).first()
        if not job:
            return {"success": False, "message": f"Job {job_id} not found"}

        file_row = db.query(models.FileStore).filter(models.FileStore.file_id == job.file_id).first() if job.file_id else None
        if not file_row:
            job.status = "FAILED"
            job.error_message = "No file associated with job"
            db.add(job)
            db.commit()
            return {"success": False, "message": "No file associated with job"}

        job.status = "IN_PROGRESS"
        db.add(job)
        db.commit()

        po_ids = handle_upload_file_parse(
            file_path=file_row.file_path,
            client_id=job.client_id,
            environment=((job.payload_json or {}).get("environment") or "STAGING"),
            file_id=file_row.file_id,
            job_id=job.job_id,
            source_type=(job.payload_json or {}).get("source_channel") or "UPLOAD",
            requested_by=job.requested_by,
            inbound_message_id=(job.payload_json or {}).get("inbound_message_id"),
        )
        # Backward compat: handler returns a list for multi-PO files and a single
        # UUID / scalar for legacy single-PO callers.
        if not isinstance(po_ids, list):
            po_ids = [po_ids] if po_ids else []
        primary_po_id = po_ids[0] if po_ids else None
        
        job.status = "COMPLETED"
        job.po_id = primary_po_id
        job.result_json = {
            "po_id": str(primary_po_id) if primary_po_id else None,
            "all_po_ids": [str(p) for p in po_ids],
            "split_count": len(po_ids),
        }
        db.add(job)
        db.commit()
        return {
            "success": True,
            "job_id": job_id,
            "po_id": str(primary_po_id) if primary_po_id else None,
            "all_po_ids": [str(p) for p in po_ids],
            "split_count": len(po_ids),
        }
    except Exception as exc:
        db.rollback()
        try:
            job = db.query(models.ProcessingJob).filter(models.ProcessingJob.job_id == job_id).first()
            if job:
                job.status = "FAILED"
                job.error_message = str(exc)
                db.add(job)
                db.commit()
        except Exception:
            db.rollback()
        return {"success": False, "job_id": job_id, "message": str(exc)}
    finally:
        db.close()
