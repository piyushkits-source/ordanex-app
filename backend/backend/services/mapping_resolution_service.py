from __future__ import annotations

from sqlalchemy.orm import Session

from backend.db import models


def resolve_mapping_profile(
    db: Session,
    partner_id: str,
    document_type: str,
    input_format: str,
):
    row = (
        db.query(models.TradingPartnerMappingProfile)
        .filter(
            models.TradingPartnerMappingProfile.partner_id == partner_id,
            models.TradingPartnerMappingProfile.document_type == document_type,
            models.TradingPartnerMappingProfile.input_format == input_format,
        )
        .order_by(models.TradingPartnerMappingProfile.created_at.desc())
        .first()
    )
    return row