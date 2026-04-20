from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.db.database import get_db
from backend.db import models_trading_partner_agentic as models
from backend.db import schemas_trading_partner_agentic as schemas

router = APIRouter(prefix="/message-registry", tags=["Message Registry"])

@router.get("", response_model=list[schemas.MessageRegistryRead])
def get_registry(db: Session = Depends(get_db)):
    return db.query(models.MessageStandardRegistry).order_by(models.MessageStandardRegistry.message_family.asc(), models.MessageStandardRegistry.message_standard.asc(), models.MessageStandardRegistry.message_version.asc()).all()

@router.post("", response_model=schemas.MessageRegistryRead)
def create_registry(payload: schemas.MessageRegistryCreate, db: Session = Depends(get_db)):
    row = models.MessageStandardRegistry(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
