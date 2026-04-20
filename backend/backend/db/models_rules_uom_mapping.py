from datetime import datetime
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from backend.db.database import Base


class TradingPartnerUomRule(Base):
    __tablename__ = "trading_partner_uom_rules"

    uom_rule_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    partner_id = Column(UUID(as_uuid=True), ForeignKey("trading_partners.partner_id", ondelete="CASCADE"), nullable=False, index=True)

    sold_to = Column(String(100), nullable=True, index=True)
    ship_to = Column(String(100), nullable=True, index=True)
    material_code = Column(String(255), nullable=True, index=True)
    product_code = Column(String(255), nullable=True, index=True)

    input_uom = Column(String(50), nullable=False)
    output_uom = Column(String(50), nullable=False)
    conversion_factor = Column(Numeric(18, 6), nullable=True)
    conversion_divider = Column(Numeric(18, 6), nullable=True)
    rounding_digits = Column(Integer, nullable=False, default=2)
    rounding_mode = Column(String(20), nullable=False, default="HALF_UP")
    min_quantity = Column(Numeric(18, 6), nullable=True)
    max_quantity = Column(Numeric(18, 6), nullable=True)

    priority = Column(Integer, nullable=False, default=100)
    is_active = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=True)

    created_by = Column(String(255), nullable=True)
    updated_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class TradingPartnerBusinessRule(Base):
    __tablename__ = "trading_partner_business_rules"

    rule_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    partner_id = Column(UUID(as_uuid=True), ForeignKey("trading_partners.partner_id", ondelete="CASCADE"), nullable=False, index=True)

    rule_name = Column(String(255), nullable=False)
    rule_type = Column(String(50), nullable=False, default="TRANSFORMATION")  # VALIDATION / TRANSFORMATION / ROUTING / ENRICHMENT
    document_type = Column(String(50), nullable=False, default="PO")
    message_direction = Column(String(20), nullable=False, default="INBOUND")

    sold_to = Column(String(100), nullable=True, index=True)
    ship_to = Column(String(100), nullable=True, index=True)
    material_code = Column(String(255), nullable=True, index=True)

    condition_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    action_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))

    priority = Column(Integer, nullable=False, default=100)
    stop_on_match = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=True)

    created_by = Column(String(255), nullable=True)
    updated_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class TradingPartnerMappingProfile(Base):
    __tablename__ = "trading_partner_mapping_profiles"

    mapping_profile_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    partner_id = Column(UUID(as_uuid=True), ForeignKey("trading_partners.partner_id", ondelete="CASCADE"), nullable=False, index=True)

    profile_name = Column(String(255), nullable=False)
    document_type = Column(String(50), nullable=False, default="PO")
    input_format = Column(String(50), nullable=False, default="PDF")
    source_channel = Column(String(50), nullable=True)

    sold_to = Column(String(100), nullable=True, index=True)
    ship_to = Column(String(100), nullable=True, index=True)

    field_mapping_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    header_defaults_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    line_mapping_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    validation_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))

    layout_hint_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    ai_prompt_override = Column(Text, nullable=True)

    version_no = Column(Integer, nullable=False, default=1)
    priority = Column(Integer, nullable=False, default=100)
    is_default = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=True)

    created_by = Column(String(255), nullable=True)
    updated_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class TradingPartnerOnboardingAudit(Base):
    __tablename__ = "trading_partner_onboarding_audit"

    audit_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    client_id = Column(String(100), nullable=False, index=True)
    partner_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    entity_type = Column(String(50), nullable=False)  # PROFILE / CONNECTION / UOM / RULE / MAPPING
    entity_id = Column(String(100), nullable=False)
    action = Column(String(20), nullable=False)  # CREATE / UPDATE / DELETE
    before_json = Column(JSONB, nullable=True)
    after_json = Column(JSONB, nullable=True)

    actor_email = Column(String(255), nullable=True)
    actor_role = Column(String(50), nullable=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
