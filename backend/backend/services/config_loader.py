from sqlalchemy.orm import Session
from backend.db import models

def _get_cfg(db: Session, client_id: str, config_type: str):
    row = db.query(models.ClientConfig).filter(
        models.ClientConfig.client_id == client_id,
        models.ClientConfig.config_type == config_type,
        models.ClientConfig.config_key == "default",
        models.ClientConfig.is_active == True,
    ).first()
    return row.config_value_json if row else {}

def get_notification_config(db: Session, client_id: str) -> dict:
    return _get_cfg(db, client_id, "notifications")

def get_sap_config(db: Session, client_id: str) -> dict:
    return _get_cfg(db, client_id, "sap")

def get_item_mapping_config(db: Session, client_id: str) -> dict:
    return _get_cfg(db, client_id, "item_mapping")

def get_business_rules(db: Session, client_id: str):
    return db.query(models.BusinessRule).filter(
        models.BusinessRule.client_id == client_id,
        models.BusinessRule.is_active == True
    ).order_by(models.BusinessRule.priority.asc()).all()

def get_uom_rules(db: Session, client_id: str):
    return db.query(models.UomConversionRule).filter(
        models.UomConversionRule.client_id == client_id,
        models.UomConversionRule.is_active == True
    ).order_by(models.UomConversionRule.priority.asc()).all()
