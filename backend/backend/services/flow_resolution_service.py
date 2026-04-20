from __future__ import annotations

from sqlalchemy.orm import Session

from backend.db import models


class FlowResolutionError(Exception):
    pass


def resolve_message_flow(
    db: Session,
    *,
    client_id: str,
    vertical_id: str | None,
    partner_id: str,
    document_type: str,
    message_direction: str,
    source_format: str,
    source_message_standard: str | None = None,
    source_message_type: str | None = None,
    source_message_version: str | None = None,
):
    query = db.query(models.TradingPartnerMessageFlow).filter(
        models.TradingPartnerMessageFlow.client_id == client_id,
        models.TradingPartnerMessageFlow.partner_id == partner_id,
        models.TradingPartnerMessageFlow.document_type == document_type,
        models.TradingPartnerMessageFlow.message_direction == message_direction,
        models.TradingPartnerMessageFlow.source_format == source_format,
        models.TradingPartnerMessageFlow.is_active == True,  # noqa: E712
    )

    if vertical_id:
        query = query.filter(
            (models.TradingPartnerMessageFlow.vertical_id == vertical_id)
            | (models.TradingPartnerMessageFlow.vertical_id.is_(None))
        )

    if source_message_standard:
        query = query.filter(
            (models.TradingPartnerMessageFlow.source_message_standard == source_message_standard)
            | (models.TradingPartnerMessageFlow.source_message_standard.is_(None))
        )

    if source_message_type:
        query = query.filter(
            (models.TradingPartnerMessageFlow.source_message_type == source_message_type)
            | (models.TradingPartnerMessageFlow.source_message_type.is_(None))
        )

    if source_message_version:
        query = query.filter(
            (models.TradingPartnerMessageFlow.source_message_version == source_message_version)
            | (models.TradingPartnerMessageFlow.source_message_version.is_(None))
        )

    rows = query.order_by(
        models.TradingPartnerMessageFlow.priority.asc(),
        models.TradingPartnerMessageFlow.created_at.desc(),
    ).all()

    if not rows:
        raise FlowResolutionError(
            "No active message flow found for the given client / vertical / partner / document combination."
        )

    return rows[0]
