from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from backend.db.database import get_db
from backend.db import models, schemas

router = APIRouter(prefix="/message-flows", tags=["Message Flows"])


@router.get("", response_model=list[schemas.MessageFlowRead])
def get_flows(partner_id: UUID, db: Session = Depends(get_db)):
    return (
        db.query(models.MessageFlow)
        .filter(models.MessageFlow.partner_id == partner_id)
        .order_by(models.MessageFlow.priority.asc())
        .all()
    )


@router.post("", response_model=schemas.MessageFlowRead)
def create_flow(payload: schemas.MessageFlowCreate, db: Session = Depends(get_db)):
    row = models.MessageFlow(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/{flow_id}", response_model=schemas.MessageFlowRead)
def update_flow(flow_id: UUID, payload: schemas.MessageFlowUpdate, db: Session = Depends(get_db)):
    row = db.query(models.MessageFlow).filter(models.MessageFlow.flow_id == flow_id).first()

    if not row:
        raise HTTPException(status_code=404, detail="Flow not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)

    db.commit()
    db.refresh(row)
    return row


@router.delete("/{flow_id}")
def delete_flow(flow_id: UUID, db: Session = Depends(get_db)):
    row = db.query(models.MessageFlow).filter(models.MessageFlow.flow_id == flow_id).first()

    if not row:
        raise HTTPException(status_code=404, detail="Flow not found")

    db.delete(row)
    db.commit()
    return {"status": "deleted"}