from __future__ import annotations

from sqlalchemy.orm import Session

from backend.db import models


def load_rules_for_client(db: Session, client_id: str) -> list[dict]:
    rows = (
        db.query(models.ClientConfig)
        .filter(
            models.ClientConfig.client_id == client_id,
            models.ClientConfig.config_type == "rule_engine",
            models.ClientConfig.is_active == True,
        )
        .all()
    )

    rules: list[dict] = []
    for row in rows:
        payload = row.config_value_json or {}
        if isinstance(payload, dict) and isinstance(payload.get("rules"), list):
            rules.extend(payload["rules"])

    return rules
