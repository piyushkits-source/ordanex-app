from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import UUID
from backend.db.database import get_db
from backend.db import models_trading_partner_agentic as models
from backend.db import schemas_trading_partner_agentic as schemas

router = APIRouter(prefix="/trading-partners-agentic", tags=["Trading Partners Agentic"])

@router.get("/projects", response_model=list[schemas.AgenticProjectRead])
def get_projects(partner_id: UUID, db: Session = Depends(get_db)):
    return db.query(models.AgenticOnboardingProject).filter(models.AgenticOnboardingProject.partner_id == partner_id).order_by(models.AgenticOnboardingProject.updated_at.desc()).all()

@router.post("/projects", response_model=schemas.AgenticProjectRead)
def create_project(payload: schemas.AgenticProjectCreate, db: Session = Depends(get_db)):
    row = models.AgenticOnboardingProject(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.post("/discover", response_model=schemas.AgenticDiscoveryResponse)
def discover(payload: schemas.AgenticDiscoveryRequest):
    notes = []
    standard = payload.message_standard
    version = payload.message_version
    if standard == "PAPER_PO":
        notes.append("Paper PO detected. Use hybrid OCR + AI extraction and configurable review.")
    elif standard == "EDIFACT":
        notes.append("Use standard/version registry to resolve parser and validation adapter.")
        if not version:
            notes.append("Version not provided. Infer from interchange headers or implementation guideline.")
    elif standard == "X12":
        notes.append("Use transaction-set + version metadata for validation.")
    else:
        notes.append("Use schema-guided mapping for structured format onboarding.")

    return schemas.AgenticDiscoveryResponse(
        message_standard=standard,
        message_version=version,
        recommended_extraction_mode=payload.extraction_mode,
        suggested_mapping_strategy="STANDARD_MODEL_THEN_TARGET_MAPPING",
        notes=notes,
    )
