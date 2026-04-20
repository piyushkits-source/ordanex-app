from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.db.database import get_db
from backend.db import schemas
from backend.services.job_service import create_job, get_job, list_jobs
from backend.services.rbac import get_current_user, enforce_client_scope

router = APIRouter(prefix="/jobs", tags=["Jobs"])

@router.post("/", response_model=schemas.JobReadResponse)
def create_background_job(payload: schemas.JobCreateRequest, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    enforce_client_scope(current_user, payload.client_id)
    return create_job(db, client_id=payload.client_id, job_type=payload.job_type, payload_json=payload.payload_json, po_id=payload.po_id, file_id=payload.file_id, priority=payload.priority, requested_by=current_user.email)

@router.get("/", response_model=list[schemas.JobReadResponse])
def get_jobs(client_id: str | None = None, status: str | None = None, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if client_id:
        enforce_client_scope(current_user, client_id)
    elif current_user.role != "super_admin":
        client_id = current_user.client_id
    return list_jobs(db, client_id=client_id, status=status)

@router.get("/{job_id}", response_model=schemas.JobReadResponse)
def get_background_job(job_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    job = get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    enforce_client_scope(current_user, job.client_id)
    return job
