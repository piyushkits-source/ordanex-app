from __future__ import annotations

from sqlalchemy.orm import Session

from backend.db import models


def load_mapping_profiles_for_client(db: Session, client_id: str) -> list[dict]:
    rows = (
        db.query(models.MappingProfile)
        .filter(
            models.MappingProfile.client_id == client_id,
            models.MappingProfile.is_active == True,
        )
        .order_by(models.MappingProfile.priority.asc())
        .all()
    )

    out = []
    for r in rows:
        out.append(
            {
                "mapping_profile_id": r.mapping_profile_id,
                "client_id": r.client_id,
                "profile_name": r.profile_name,
                "sold_to": r.sold_to,
                "ship_to": r.ship_to,
                "priority": r.priority,
                "description": r.description,
                "mapping_json": r.mapping_json or {},
                "is_active": r.is_active,
            }
        )
    return out
