from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from backend.db.database import Base


class TradingPartner(Base):
    __tablename__ = "trading_partners"

    partner_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    vertical_id = Column(UUID(as_uuid=True), ForeignKey("business_verticals.vertical_id", ondelete="CASCADE"), nullable=True, index=True)
    partner_code = Column(String(100), nullable=False)
    partner_name = Column(String(255), nullable=False)
    partner_type = Column(String(50), nullable=False)
    status = Column(String(30), nullable=False, default="ACTIVE")
    connection_method = Column(String(50))
    email = Column(String(255))
    edi_id = Column(String(100))
    sftp_path = Column(Text)
    as2_id = Column(String(255))
    api_reference = Column(String(255))
    notes = Column(Text)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())


class TradingPartnerProfile(Base):
    __tablename__ = "trading_partner_profiles"

    onboarding_profile_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    partner_id = Column(UUID(as_uuid=True), ForeignKey("trading_partners.partner_id", ondelete="CASCADE"), nullable=False, index=True)
    profile_name = Column(String(255), nullable=False, default="Default Profile")
    profile_status = Column(String(30), nullable=False, default="ACTIVE")
    duplicate_check_enabled = Column(Boolean, nullable=False, default=True)
    duplicate_check_scope = Column(String(50), nullable=False, default="PO_NUMBER")
    split_rule = Column(String(50), nullable=False, default="NONE")
    split_po_number_strategy = Column(String(50), nullable=False, default="SAME_PO_NUMBER")
    split_po_separator = Column(String(10), default="-")
    delivery_date_source = Column(String(50), nullable=False, default="PO_DELIVERY_DATE")
    delivery_date_offset_type = Column(String(20), nullable=False, default="NONE")
    delivery_date_offset_days = Column(Integer, nullable=False, default=0)
    po_date_source = Column(String(50), nullable=False, default="PO_DATE")
    max_split_quantity = Column(Numeric(18, 4), nullable=True)
    max_split_uom = Column(String(50), nullable=True)
    split_quantity_basis = Column(String(30), nullable=True)
    split_rounding_mode = Column(String(20), nullable=True)
    split_po_prefix = Column(String(50), nullable=True)
    split_po_suffix = Column(String(50), nullable=True)
    split_po_format = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())


class TradingPartnerConnection(Base):
    __tablename__ = "trading_partner_connections"

    connection_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    partner_id = Column(UUID(as_uuid=True), ForeignKey("trading_partners.partner_id", ondelete="CASCADE"), nullable=False, index=True)
    connection_name = Column(String(255), nullable=False)
    connection_type = Column(String(50), nullable=False)
    direction = Column(String(20), nullable=False)
    message_type = Column(String(100), nullable=True)
    message_version = Column(String(50), nullable=True)
    config_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())
