from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func, text

from backend.db.database import Base

class PartnerAddressMaster(Base):
    __tablename__ = "partner_address_master"

    address_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    client_id = Column(String(100), nullable=False, index=True)
    vertical_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    partner_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    partner_type = Column(String(50), nullable=False)
    direction = Column(String(20), nullable=False, default="INBOUND")
    address_role = Column(String(50), nullable=False, default="SHIP_TO")
    address_code = Column(String(100), nullable=True)
    erp_address_code = Column(String(100), nullable=True)
    name_1 = Column(String(255), nullable=True)
    address_line_1 = Column(String(255), nullable=True)
    city = Column(String(100), nullable=True)
    postal_code = Column(String(50), nullable=True)
    country = Column(String(50), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

class MessageStandardRegistry(Base):
    __tablename__ = "message_standard_registry"

    registry_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    message_family = Column(String(50), nullable=False, index=True)
    message_standard = Column(String(50), nullable=False, index=True)
    message_version = Column(String(50), nullable=True, index=True)
    canonical_code = Column(String(100), nullable=True)
    parser_adapter = Column(String(255), nullable=True)
    validation_adapter = Column(String(255), nullable=True)
    direction = Column(String(20), nullable=False, default="INBOUND")
    is_active = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

class AgenticOnboardingProject(Base):
    __tablename__ = "agentic_onboarding_projects"

    project_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    client_id = Column(String(100), nullable=False, index=True)
    partner_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    profile_name = Column(String(255), nullable=False)
    message_family = Column(String(50), nullable=False, index=True)
    message_standard = Column(String(50), nullable=False, index=True)
    message_version = Column(String(50), nullable=True, index=True)
    direction = Column(String(20), nullable=False, default="INBOUND")
    target_message_family = Column(String(50), nullable=True)
    extraction_mode = Column(String(50), nullable=True, default="HYBRID_AI_OCR")
    sample_reference = Column(String(500), nullable=True)
    discovery_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    extraction_profile_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    address_match_profile_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    mapping_profile_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    rule_profile_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    status = Column(String(30), nullable=False, default="DRAFT")
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
