from __future__ import annotations

import uuid
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from backend.db.database import Base


class TradingPartnerMessageFlow(Base):
    __tablename__ = "trading_partner_message_flows"

    flow_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    client_id = Column(String, nullable=False, index=True)
    vertical_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    partner_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    flow_name = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    priority = Column(Integer, nullable=False, default=100)

    document_type = Column(String, nullable=False)  # PO / ASN / INVOICE / ORDER_RESPONSE / ORDER_CHANGE
    message_direction = Column(String, nullable=False)  # INBOUND / OUTBOUND

    source_format = Column(String, nullable=False, default="PDF")  # PDF / EDI / XML / JSON / EXCEL / API
    source_message_standard = Column(String, nullable=True)  # X12 / EDIFACT / IDOC / cXML / API
    source_message_type = Column(String, nullable=True)  # 850 / ORDERS / DESADV / INVOIC / etc
    source_message_version = Column(String, nullable=True)  # 4010 / 5010 / D97A / ORDERS05 / v1

    target_erp = Column(String, nullable=False)  # SAP / ORACLE / D365 / NETSUITE / GENERIC
    target_message_standard = Column(String, nullable=False)  # IDOC / API / XML / JSON / X12 / EDIFACT
    target_message_type = Column(String, nullable=False)  # ORDERS / salesOrderApi / orderXml
    target_message_version = Column(String, nullable=True)  # ORDERS03 / ORDERS05 / v1 / D97A

    target_connection_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    mapping_profile_id = Column(UUID(as_uuid=True), nullable=True)
    rules_profile_id = Column(UUID(as_uuid=True), nullable=True)
    uom_profile_id = Column(UUID(as_uuid=True), nullable=True)
    address_profile_id = Column(UUID(as_uuid=True), nullable=True)
    parser_profile_id = Column(UUID(as_uuid=True), nullable=True)
    validation_profile_id = Column(UUID(as_uuid=True), nullable=True)

    requires_review_on_error = Column(Boolean, nullable=False, default=True)
    auto_send_on_success = Column(Boolean, nullable=False, default=False)
    allow_partial_processing = Column(Boolean, nullable=False, default=False)
    archive_mode = Column(String, nullable=True)

    flow_notes = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
