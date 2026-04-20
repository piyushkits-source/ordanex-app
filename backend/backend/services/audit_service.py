from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from backend.db import models


def create_audit_log(
    db: Session,
    *,
    client_id: str,
    entity_type: str,
    entity_id: str,
    action: str,
    old_value_json: dict | None = None,
    new_value_json: dict | None = None,
    actor_email: str | None = None,
    actor_role: str | None = None,
):
    if not hasattr(models, "AuditLog"):
        return None

    row = models.AuditLog(
        client_id=client_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        old_value_json=old_value_json,
        new_value_json=new_value_json,
        actor_email=actor_email,
        actor_role=actor_role,
    )
    db.add(row)
    return row