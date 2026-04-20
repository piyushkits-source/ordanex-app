from sqlalchemy.orm import Session
from backend.db import models


def get_client_sap_config(db: Session, client_id: str) -> dict:
    row = (
        db.query(models.ClientConfig)
        .filter(models.ClientConfig.client_id == client_id)
        .filter(models.ClientConfig.config_type == "sap")
        .filter(models.ClientConfig.config_key == "default")   # ✅ ADD THIS
        .filter(models.ClientConfig.is_active == True)
        .order_by(models.ClientConfig.updated_at.desc())
        .first()
    )

    cfg = row.config_value_json if row else {}

    return {
        "sender": cfg.get("sender", "EXTSYS"),
        "receiver": cfg.get("receiver", "SAPSYS"),
        "idoctyp": cfg.get("idoctyp", "ORDERS05"),
        "mestyp": cfg.get("mestyp", "ORDERS"),
        "po_type": cfg.get("po_type", "NB"),
        "order_type": cfg.get("order_type", "OR"),
    }