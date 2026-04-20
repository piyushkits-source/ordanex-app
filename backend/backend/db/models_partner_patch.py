from sqlalchemy import Column, String, Text, DateTime, Boolean, Integer, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func, text
from backend.db.database import Base

class TradingPartner(Base):
    __tablename__ = "trading_partners"
    partner_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    vertical_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    partner_code = Column(String(100), nullable=False)
    partner_name = Column(String(255), nullable=False)
    partner_type = Column(String(50), nullable=False, default="CUSTOMER")
    status = Column(String(30), nullable=False, default="ACTIVE")
    notes = Column(Text)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

class PartnerConnection(Base):
    __tablename__ = "partner_connections"
    connection_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    partner_id = Column(UUID(as_uuid=True), ForeignKey("trading_partners.partner_id", ondelete="CASCADE"), nullable=False, index=True)
    connection_type = Column(String(50), nullable=False)
    direction = Column(String(20), nullable=False)
    config_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

class PartnerOnboardingProfile(Base):
    __tablename__ = "partner_onboarding_profiles"
    onboarding_profile_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    partner_id = Column(UUID(as_uuid=True), ForeignKey("trading_partners.partner_id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    duplicate_check_enabled = Column(Boolean, nullable=False, default=True)
    duplicate_check_scope = Column(String(50), nullable=False, default="PO_NUMBER")
    split_rule = Column(String(50), nullable=False, default="NONE")
    split_po_number_strategy = Column(String(50), nullable=False, default="SAME_PO_NUMBER")
    split_po_separator = Column(String(10), nullable=False, default="-")
    delivery_date_source = Column(String(50), nullable=False, default="PO_DELIVERY_DATE")
    delivery_date_offset_type = Column(String(20), nullable=False, default="NONE")
    delivery_date_offset_days = Column(Integer, nullable=False, default=0)
    po_date_source = Column(String(50), nullable=False, default="PO_DATE")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

class PartnerUomRule(Base):
    __tablename__ = "partner_uom_rules"
    uom_rule_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    partner_id = Column(UUID(as_uuid=True), ForeignKey("trading_partners.partner_id", ondelete="CASCADE"), nullable=False, index=True)
    customer_code = Column(String(100))
    supplier_code = Column(String(100))
    ship_to_code = Column(String(100))
    material_code = Column(String(100))
    product_code = Column(String(100))
    input_uom = Column(String(50), nullable=False)
    output_uom = Column(String(50), nullable=False)
    conversion_factor = Column(Numeric(18, 6))
    conversion_divider = Column(Numeric(18, 6))
    rounding_digits = Column(Integer, nullable=False, default=2)
    priority = Column(Integer, nullable=False, default=100)
    is_active = Column(Boolean, nullable=False, default=True)
    notes = Column(Text)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

class PartnerFieldMapping(Base):
    __tablename__ = "partner_field_mappings"
    mapping_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    partner_id = Column(UUID(as_uuid=True), ForeignKey("trading_partners.partner_id", ondelete="CASCADE"), nullable=False, index=True)
    source_field = Column(String(255), nullable=False)
    target_field = Column(String(255), nullable=False)
    transform_type = Column(String(50), nullable=False, default="DIRECT")
    transform_config = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

class PartnerNotification(Base):
    __tablename__ = "partner_notifications"
    notification_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    partner_id = Column(UUID(as_uuid=True), ForeignKey("trading_partners.partner_id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(255), nullable=False)
    notification_type = Column(String(50), nullable=False, default="FAILED")
    include_attachment = Column(Boolean, nullable=False, default=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

class PartnerBulkUploadLog(Base):
    __tablename__ = "partner_bulk_upload_logs"
    upload_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    file_name = Column(Text)
    total_records = Column(Integer, nullable=False, default=0)
    success_count = Column(Integer, nullable=False, default=0)
    failure_count = Column(Integer, nullable=False, default=0)
    status = Column(String(30), nullable=False, default="COMPLETED")
    error_log_json = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    created_at = Column(DateTime, nullable=False, server_default=func.now())
