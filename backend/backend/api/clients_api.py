from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db import models, schemas
from backend.services.rbac import get_current_user, require_roles

router = APIRouter(prefix="/clients", tags=["Clients"])


@router.get("/", response_model=list[schemas.ClientRead])
def get_clients(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role == "super_admin":
        return db.query(models.Client).order_by(models.Client.client_id.asc()).all()

    client = (
        db.query(models.Client)
        .filter(models.Client.client_id == current_user.client_id)
        .first()
    )
    return [client] if client else []


@router.get("/{client_id}", response_model=schemas.ClientRead)
def get_client(
    client_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role != "super_admin" and current_user.client_id != client_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this client")

    client = (
        db.query(models.Client)
        .filter(models.Client.client_id == client_id)
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.post("/", response_model=schemas.ClientRead)
def create_client(
    payload: schemas.ClientCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("super_admin")),
):
    existing = (
        db.query(models.Client)
        .filter(models.Client.client_id == payload.client_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Client already exists")

    client = models.Client(**payload.model_dump())
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.put("/{client_id}", response_model=schemas.ClientRead)
def update_client(
    client_id: str,
    payload: schemas.ClientCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("super_admin")),
):
    client = (
        db.query(models.Client)
        .filter(models.Client.client_id == client_id)
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    data = payload.model_dump()

    # keep client_id stable; do not allow accidental rename here
    data.pop("client_id", None)

    for field, value in data.items():
        setattr(client, field, value)

    db.add(client)
    db.commit()
    db.refresh(client)
    return client

@router.put("/{client_id}", response_model=schemas.ClientRead)
def update_client(
    client_id: str,
    payload: schemas.ClientCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("super_admin"))
):
    client = db.query(models.Client).filter(models.Client.client_id == client_id).first()

    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    for key, value in payload.model_dump().items():
        setattr(client, key, value)

    db.commit()
    db.refresh(client)
    return client