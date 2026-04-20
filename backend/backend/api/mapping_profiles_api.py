from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db import models, schemas
from backend.services.rbac import get_current_user, require_roles, enforce_client_scope

router = APIRouter(prefix="/mapping-profiles", tags=["Mapping Profiles"])


@router.get("/", response_model=list[schemas.MappingProfileRead])
def list_mapping_profiles(
    client_id: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(models.MappingProfile)

    if client_id:
        if client_id.upper() != "GLOBAL":
            enforce_client_scope(current_user, client_id)
        q = q.filter(models.MappingProfile.client_id == client_id)

    return q.order_by(
        models.MappingProfile.client_id.asc(),
        models.MappingProfile.priority.asc(),
        models.MappingProfile.updated_at.desc(),
    ).all()


@router.get("/{mapping_profile_id}", response_model=schemas.MappingProfileRead)
def get_mapping_profile(
    mapping_profile_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    row = (
        db.query(models.MappingProfile)
        .filter(models.MappingProfile.mapping_profile_id == mapping_profile_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Mapping profile not found")

    if row.client_id.upper() != "GLOBAL":
        enforce_client_scope(current_user, row.client_id)

    return row


@router.post("/", response_model=schemas.MappingProfileRead)
def create_mapping_profile(
    payload: schemas.MappingProfileCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("super_admin", "client_admin")),
):
    if payload.client_id.upper() != "GLOBAL":
        enforce_client_scope(current_user, payload.client_id)

    exists = (
        db.query(models.MappingProfile)
        .filter(models.MappingProfile.client_id == payload.client_id)
        .filter(models.MappingProfile.profile_name == payload.profile_name)
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="Profile name already exists for this client")

    if payload.parent_profile_id:
        parent = (
            db.query(models.MappingProfile)
            .filter(models.MappingProfile.mapping_profile_id == payload.parent_profile_id)
            .first()
        )
        if not parent:
            raise HTTPException(status_code=400, detail="Parent profile not found")

    row = models.MappingProfile(
        client_id=payload.client_id,
        profile_name=payload.profile_name,
        sold_to=payload.sold_to,
        ship_to=payload.ship_to,
        parent_profile_id=payload.parent_profile_id,
        priority=payload.priority,
        description=payload.description,
        mapping_json=payload.mapping_json,
        is_active=payload.is_active,
        created_by=current_user.email,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/{mapping_profile_id}", response_model=schemas.MappingProfileRead)
def update_mapping_profile(
    mapping_profile_id: str,
    payload: schemas.MappingProfileUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("super_admin", "client_admin")),
):
    row = (
        db.query(models.MappingProfile)
        .filter(models.MappingProfile.mapping_profile_id == mapping_profile_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Mapping profile not found")

    if row.client_id.upper() != "GLOBAL":
        enforce_client_scope(current_user, row.client_id)

    data = payload.model_dump(exclude_unset=True)

    if "client_id" in data and data["client_id"] and data["client_id"].upper() != "GLOBAL":
        enforce_client_scope(current_user, data["client_id"])

    if "parent_profile_id" in data and data["parent_profile_id"]:
        parent = (
            db.query(models.MappingProfile)
            .filter(models.MappingProfile.mapping_profile_id == data["parent_profile_id"])
            .first()
        )
        if not parent:
            raise HTTPException(status_code=400, detail="Parent profile not found")
        if str(parent.mapping_profile_id) == str(row.mapping_profile_id):
            raise HTTPException(status_code=400, detail="Profile cannot inherit from itself")

    for field, value in data.items():
        setattr(row, field, value)

    db.commit()
    db.refresh(row)
    return row


@router.delete("/{mapping_profile_id}")
def delete_mapping_profile(
    mapping_profile_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("super_admin", "client_admin")),
):
    row = (
        db.query(models.MappingProfile)
        .filter(models.MappingProfile.mapping_profile_id == mapping_profile_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Mapping profile not found")

    if row.client_id.upper() != "GLOBAL":
        enforce_client_scope(current_user, row.client_id)

    children = (
        db.query(models.MappingProfile)
        .filter(models.MappingProfile.parent_profile_id == row.mapping_profile_id)
        .count()
    )
    if children > 0:
        raise HTTPException(status_code=400, detail="Cannot delete profile with child profiles")

    db.delete(row)
    db.commit()
    return {"message": "Mapping profile deleted successfully"}