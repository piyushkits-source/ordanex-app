from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.core.deps import get_db
from backend.db import models, schemas

router = APIRouter(prefix="/parser-profiles", tags=["Parser Profiles"])


@router.get("/", response_model=list[schemas.ParserProfileRead])
def list_parser_profiles(
    client_id: str | None = Query(default=None),
    partner_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(models.ParserProfile)

    if client_id:
        query = query.filter(models.ParserProfile.client_id == client_id)

    if partner_id:
        query = query.filter(models.ParserProfile.partner_id == partner_id)

    return query.order_by(models.ParserProfile.priority.asc()).all()


@router.get("/{parser_profile_id}", response_model=schemas.ParserProfileRead)
def get_parser_profile(
    parser_profile_id: UUID,
    db: Session = Depends(get_db),
):
    row = (
        db.query(models.ParserProfile)
        .filter(models.ParserProfile.parser_profile_id == parser_profile_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Parser profile not found.")
    return row


@router.post("/", response_model=schemas.ParserProfileRead)
def create_parser_profile(
    payload: schemas.ParserProfileCreate,
    db: Session = Depends(get_db),
):
    row = models.ParserProfile(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/{parser_profile_id}", response_model=schemas.ParserProfileRead)
def update_parser_profile(
    parser_profile_id: UUID,
    payload: schemas.ParserProfileUpdate,
    db: Session = Depends(get_db),
):
    row = (
        db.query(models.ParserProfile)
        .filter(models.ParserProfile.parser_profile_id == parser_profile_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Parser profile not found.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)

    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{parser_profile_id}")
def delete_parser_profile(
    parser_profile_id: UUID,
    db: Session = Depends(get_db),
):
    row = (
        db.query(models.ParserProfile)
        .filter(models.ParserProfile.parser_profile_id == parser_profile_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Parser profile not found.")

    db.delete(row)
    db.commit()
    return {"status": "deleted"}