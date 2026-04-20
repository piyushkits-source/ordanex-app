from datetime import datetime
from sqlalchemy import asc
from sqlalchemy.orm import Session
from backend.db import models

def create_job(db: Session, client_id: str, job_type: str, payload_json: dict | None = None, po_id=None, file_id=None, priority: int = 100, requested_by: str | None = None):
    job = models.ProcessingJob(client_id=client_id, job_type=job_type, payload_json=payload_json or {}, po_id=po_id, file_id=file_id, priority=priority, requested_by=requested_by, status="NEW")
    db.add(job)
    db.commit()
    db.refresh(job)
    return job

def get_job(db: Session, job_id):
    return db.query(models.ProcessingJob).filter(models.ProcessingJob.job_id == job_id).first()

def list_jobs(db: Session, client_id: str | None = None, status: str | None = None):
    query = db.query(models.ProcessingJob)
    if client_id:
        query = query.filter(models.ProcessingJob.client_id == client_id)
    if status:
        query = query.filter(models.ProcessingJob.status == status)
    return query.order_by(models.ProcessingJob.created_at.desc()).all()

def claim_next_job(db: Session):
    job = db.query(models.ProcessingJob).filter(models.ProcessingJob.status == "NEW").order_by(asc(models.ProcessingJob.priority), asc(models.ProcessingJob.created_at)).first()
    if not job:
        return None
    job.status = "PROCESSING"
    job.started_at = datetime.now()
    job.attempts = (job.attempts or 0) + 1
    db.commit()
    db.refresh(job)
    return job

def mark_job_success(db: Session, job, result_json: dict | None = None):
    job.status = "SUCCESS"
    job.completed_at = datetime.now()
    job.result_json = result_json or {}
    job.error_message = None
    db.commit()
    return job

def mark_job_failed(db: Session, job, error_message: str, result_json: dict | None = None):
    job.status = "FAILED"
    job.completed_at = datetime.now()
    job.error_message = error_message
    job.result_json = result_json or {}
    db.commit()
    return job
