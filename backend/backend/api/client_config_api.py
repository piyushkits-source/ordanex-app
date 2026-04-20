from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.db.database import get_db
from backend.db import models, schemas

router = APIRouter(prefix="/client-config", tags=["Client Config"])

@router.get("/clients", response_model=list[schemas.ClientRead])
def get_clients(db: Session = Depends(get_db)):
    return db.query(models.Client).order_by(models.Client.client_name.asc()).all()

@router.post("/clients", response_model=schemas.ClientRead)
def create_client(payload: schemas.ClientCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Client).filter(models.Client.client_id == payload.client_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Client already exists")
    row = models.Client(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.put("/clients/{client_id}", response_model=schemas.ClientRead)
def update_client(client_id: str, payload: schemas.ClientUpdate, db: Session = Depends(get_db)):
    row = db.query(models.Client).filter(models.Client.client_id == client_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.get("/verticals/{client_id}", response_model=list[schemas.VerticalRead])
def get_verticals(client_id: str, db: Session = Depends(get_db)):
    return (
        db.query(models.BusinessVertical)
        .filter(models.BusinessVertical.client_id == client_id)
        .order_by(models.BusinessVertical.vertical_name.asc())
        .all()
    )

@router.post("/verticals", response_model=schemas.VerticalRead)
def create_vertical(payload: schemas.VerticalCreate, db: Session = Depends(get_db)):
    row = models.BusinessVertical(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.put("/verticals/{vertical_id}", response_model=schemas.VerticalRead)
def update_vertical(vertical_id: str, payload: schemas.VerticalUpdate, db: Session = Depends(get_db)):
    row = db.query(models.BusinessVertical).filter(models.BusinessVertical.vertical_id == vertical_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Business vertical not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.get("/connections/{client_id}", response_model=list[schemas.ClientConnectionRead])
def get_connections(client_id: str, db: Session = Depends(get_db)):
    return (
        db.query(models.ClientConnection)
        .filter(models.ClientConnection.client_id == client_id)
        .order_by(models.ClientConnection.created_at.desc())
        .all()
    )

@router.post("/connections", response_model=schemas.ClientConnectionRead)
def create_connection(payload: schemas.ClientConnectionCreate, db: Session = Depends(get_db)):
    row = models.ClientConnection(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.put("/connections/{connection_id}", response_model=schemas.ClientConnectionRead)
def update_connection(connection_id: str, payload: schemas.ClientConnectionUpdate, db: Session = Depends(get_db)):
    row = db.query(models.ClientConnection).filter(models.ClientConnection.connection_id == connection_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.get("/erp/{client_id}", response_model=list[schemas.ClientERPConfigRead])
def get_erp_configs(client_id: str, db: Session = Depends(get_db)):
    return (
        db.query(models.ClientERPConfig)
        .filter(models.ClientERPConfig.client_id == client_id)
        .order_by(models.ClientERPConfig.created_at.desc())
        .all()
    )

@router.post("/erp", response_model=schemas.ClientERPConfigRead)
def create_erp_config(payload: schemas.ClientERPConfigCreate, db: Session = Depends(get_db)):
    row = models.ClientERPConfig(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.put("/erp/{erp_config_id}", response_model=schemas.ClientERPConfigRead)
def update_erp_config(erp_config_id: str, payload: schemas.ClientERPConfigUpdate, db: Session = Depends(get_db)):
    row = db.query(models.ClientERPConfig).filter(models.ClientERPConfig.erp_config_id == erp_config_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="ERP config not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
