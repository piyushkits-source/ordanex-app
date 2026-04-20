import uuid
from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    JSON,
    func,
    text,
)

from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from backend.db.database import Base
from datetime import datetime

class Tenant(Base):
    __tablename__ = "tenants"

    tenant_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_name = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False, default="ACTIVE")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

class Role(Base):
    __tablename__ = "roles"

    role_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    role_name = Column(String(100), nullable=False)
    role_code = Column(String(100), unique=True, nullable=False)


class Permission(Base):
    __tablename__ = "permissions"

    permission_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    permission_code = Column(String(150), unique=True, nullable=False)
    permission_name = Column(String(255), nullable=False)


class UserRole(Base):
    __tablename__ = "user_roles"

    user_role_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"))
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.role_id"))
    client_id = Column(String(100), ForeignKey("clients.client_id"))
    is_active = Column(Boolean, default=True)

class InboundMessage(Base):
    __tablename__ = "inbound_messages"

    inbound_message_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())

    client_id = Column(String(100), ForeignKey("clients.client_id"), nullable=False)

    message_type = Column(String(50), default="PO")
    source_channel = Column(String(50))  # EMAIL/API/SFTP/AS2
    source_format = Column(String(50))   # PDF/X12/CSV/etc

    source_reference = Column(String(255))
    sender = Column(String(255))
    receiver = Column(String(255))

    status = Column(String(50), default="RECEIVED")

    raw_file_id = Column(UUID(as_uuid=True), ForeignKey("file_store.file_id"))

    correlation_id = Column(UUID(as_uuid=True))

    received_at = Column(DateTime, server_default=func.now())

class OutboundMessage(Base):
    __tablename__ = "outbound_messages"

    outbound_message_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())

    client_id = Column(String(100), ForeignKey("clients.client_id"))

    po_id = Column(UUID(as_uuid=True), ForeignKey("purchase_orders.po_id"))

    target_protocol = Column(String(50))  # API / IDOC / SFTP
    target_system = Column(String(255))

    status = Column(String(50), default="READY")

    payload_file_id = Column(UUID(as_uuid=True), ForeignKey("file_store.file_id"))

    attempt_count = Column(Integer, default=0)

    sent_at = Column(DateTime)
    acknowledged_at = Column(DateTime)

class FieldBoxTemplate(Base):
    __tablename__ = "field_box_templates"

    field_box_template_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())

    client_id = Column(String(100), ForeignKey("clients.client_id"))

    vendor_name = Column(String(255))
    field_name = Column(String(100))

    page_no = Column(Integer)

    x = Column(Numeric(12, 4))
    y = Column(Numeric(12, 4))
    width = Column(Numeric(12, 4))
    height = Column(Numeric(12, 4))

    version_no = Column(Integer, default=1)

class Client(Base):
    __tablename__ = "clients"
    client_id = Column(String(100), primary_key=True, index=True)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.tenant_id"))
    client_name = Column(String(255), nullable=False)
    status = Column(String(30), nullable=False, default="ACTIVE")
    default_currency = Column(String(10))
    default_sold_to = Column(String(100))
    default_ship_to = Column(String(100))
    default_vendor = Column(String(255))
    subscription_type = Column(String(50), nullable=True, default="BASIC")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

class User(Base):
    __tablename__ = "users"
    user_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=True)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.tenant_id"))

    display_name = Column(String(255))
    failed_login_count = Column(Integer, default=0)
    is_locked = Column(Boolean, default=False)
    mfa_enabled = Column(Boolean, default=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(Text, nullable=False)
    role = Column(String(50), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(String(255))
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())
    last_login_at = Column(DateTime)

class ClientConfig(Base):
    __tablename__ = "client_config"
    config_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    config_type = Column(String(50), nullable=False)
    config_key = Column(String(100), nullable=False)
    config_value_json = Column(JSONB, nullable=False, server_default="{}")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

class FileStore(Base):
    __tablename__ = "file_store"
    file_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    original_file_name = Column(String(500), nullable=False)
    mime_type = Column(String(100))
    source_channel = Column(String(50))
    source_message_id = Column(UUID(as_uuid=True))
    file_path = Column(Text)
    file_size_bytes = Column(BigInteger)
    uploaded_by = Column(String(255))
    uploaded_at = Column(DateTime, nullable=False, server_default=func.now())
    checksum = Column(String(128))

class ProcessingJob(Base):
    __tablename__ = "processing_jobs"
    job_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    file_id = Column(UUID(as_uuid=True), ForeignKey("file_store.file_id", ondelete="SET NULL"))
    po_id = Column(UUID(as_uuid=True))
    correlation_id = Column(UUID(as_uuid=True))
    step_name = Column(String(100))
    worker_name = Column(String(255))
    queue_name = Column(String(100))
    retryable = Column(Boolean, default=True)
    duration_ms = Column(BigInteger)
    job_type = Column(String(50), nullable=False)
    status = Column(String(30), nullable=False, default="NEW", index=True)
    priority = Column(Integer, nullable=False, default=100)
    requested_by = Column(String(255))
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    error_message = Column(Text)
    payload_json = Column(JSONB, nullable=False, server_default="{}")
    result_json = Column(JSONB, nullable=False, server_default="{}")
    attempts = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    po_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    file_id = Column(UUID(as_uuid=True), ForeignKey("file_store.file_id", ondelete="SET NULL"))
    job_id = Column(UUID(as_uuid=True), ForeignKey("processing_jobs.job_id", ondelete="SET NULL"))

    inbound_message_id = Column(UUID(as_uuid=True), ForeignKey("inbound_messages.inbound_message_id"))

    needs_review = Column(Boolean, default=False)
    review_status = Column(String(50))
   
    field_boxes_json = Column(JSONB, nullable=True)
    mapping_resolution_json = Column(JSONB, nullable=True)
    vendor_learning_json = Column(JSONB, nullable=True)

    approved_by_user_id = Column(UUID(as_uuid=True))
    approved_at = Column(DateTime)

    duplicate_flag = Column(Boolean, default=False)

    target_protocol = Column(String(50))
    dispatch_status = Column(String(50))
    ack_status = Column(String(50))

    correlation_id = Column(UUID(as_uuid=True))

    po_number = Column(String(255), index=True)
    original_po_number = Column(String(255), nullable=True)
    docnum = Column(String(50), nullable=True)
    mappings_json = Column(JSONB, nullable=True)
    @property
    def mappings(self):
        return self.mappings_json or []

    split_key = Column(String(255), nullable=True)
    split_sequence = Column(Integer, nullable=True)

    po_date = Column(Date)
    supplier_name = Column(String(255))
    currency = Column(String(10))
    po_type = Column(String(50))
    order_type = Column(String(50))
    sold_to = Column(String(100))
    ship_to = Column(String(100))

    ship_to_name = Column(String, nullable=True)
    ship_to_address = Column(Text, nullable=True)
    header_details = Column(Text, nullable=True)
    language_code = Column(String(20), nullable=True)

    # NEW monitor/workflow fields
    sender = Column(String(255), nullable=True)
    receiver = Column(String(255), nullable=True)
    direction = Column(String(20), nullable=True, default="INBOUND", index=True)
    environment = Column(String(20), nullable=True, default="PROD", index=True)
    received_at = Column(DateTime, nullable=True)
    processed_at = Column(DateTime, nullable=True)
    connector_used = Column(String, nullable=True)
    delivery_status = Column(String, nullable=True)
    delivery_endpoint = Column(String, nullable=True)
    delivery_reference = Column(String, nullable=True)
    delivery_response_text = Column(Text, nullable=True) 
    delivered_at = Column(DateTime, nullable=True)
    delivery_result_json = Column(JSON, nullable=True)
    target_adapter_name = Column(String, nullable=True)
    target_content_type = Column(String, nullable=True)

    status = Column(String(30), nullable=False, default="NEW", index=True)
    source_type = Column(String(30), nullable=False, default="AI")
    po_confidence = Column(String(20))
    po_validation_reason = Column(Text)
    xml_payload = Column(Text)
    total_items = Column(Integer, nullable=False, default=0)
    retry_count = Column(Integer, nullable=False, default=0)
    created_by = Column(String(255))
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

    raw_text = Column(Text, nullable=True)

    items = relationship(
        "PurchaseOrderItem",
        back_populates="purchase_order",
        cascade="all, delete-orphan"
    )

class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"
    po_item_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    po_id = Column(UUID(as_uuid=True), ForeignKey("purchase_orders.po_id", ondelete="CASCADE"), nullable=False, index=True)
    line_no = Column(Integer, nullable=False)
    material_code = Column(String(255))
    description = Column(Text)
    quantity = Column(Numeric(18, 4))
    uom = Column(String(50))
    unit_price = Column(Numeric(18, 4))
    amount = Column(Numeric(18, 4))
    delivery_date = Column(Date)
    plant = Column(String(50))
    is_corrected = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())
    purchase_order = relationship("PurchaseOrder", back_populates="items")

class PoLog(Base):
    __tablename__ = "po_logs"
    log_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    po_id = Column(UUID(as_uuid=True), ForeignKey("purchase_orders.po_id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    log_time = Column(DateTime, nullable=False, server_default=func.now())
    level = Column(String(20), nullable=False)
    stage = Column(String(50), nullable=False)
    message = Column(Text, nullable=False)
    error_type = Column(String(100))
    created_by = Column(String(255))

class EmailLog(Base):
    __tablename__ = "email_logs"
    email_log_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    po_id = Column(UUID(as_uuid=True), ForeignKey("purchase_orders.po_id", ondelete="CASCADE"), nullable=True, index=True)
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(50), nullable=False)
    recipients = Column(Text, nullable=False)
    subject = Column(String(500))
    status = Column(String(20), nullable=False)
    response_message = Column(Text)
    sent_at = Column(DateTime, nullable=False, server_default=func.now())
    created_by = Column(String(255))

class BusinessRule(Base):
    __tablename__ = "business_rules"
    rule_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True)
    priority = Column(Integer, nullable=False, default=100)
    sold_to = Column(String(100))
    ship_to = Column(String(100))
    material = Column(String(255))
    vendor = Column(String(255))
    plant = Column(String(50))
    source_uom = Column(String(50))
    target_uom = Column(String(50))
    quantity_multiplier = Column(Numeric(18, 6))
    quantity_divider = Column(Numeric(18, 6))
    plant_override = Column(String(50))
    material_override = Column(String(255))
    description_suffix = Column(String(255))
    currency_override = Column(String(10))
    po_type_override = Column(String(50))
    order_type_override = Column(String(50))
    notes = Column(Text)
    created_by = Column(String(255))
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

class UomConversionRule(Base):
    __tablename__ = "uom_conversion_rules"
    uom_rule_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True)
    priority = Column(Integer, nullable=False, default=100)
    sold_to = Column(String(100))
    ship_to = Column(String(100))
    material = Column(String(255))
    vendor = Column(String(255))
    plant = Column(String(50))
    input_uom = Column(String(50), nullable=False)
    output_uom = Column(String(50), nullable=False)
    conversion_factor = Column(Numeric(18, 6))
    conversion_divider = Column(Numeric(18, 6))
    rounding_digits = Column(Integer, default=2)
    notes = Column(Text)
    created_by = Column(String(255))
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

class AuditLog(Base):
    __tablename__ = "audit_logs"

    audit_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    client_id = Column(String(100), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(String(100), nullable=False)
    action = Column(String(100), nullable=False)
    old_value_json = Column(JSON, nullable=True)
    new_value_json = Column(JSON, nullable=True)
    actor_email = Column(String(255), nullable=True)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

class MappingProfile(Base):
    __tablename__ = "mapping_profiles"

    mapping_profile_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    client_id = Column(String(100), nullable=False, index=True)
    profile_name = Column(String(255), nullable=False)
    sold_to = Column(String(100), nullable=True, index=True)
    ship_to = Column(String(255), nullable=True, index=True)

    parent_profile_id = Column(UUID(as_uuid=True), ForeignKey("mapping_profiles.mapping_profile_id"), nullable=True)
    priority = Column(Integer, nullable=False, default=100)
    description = Column(Text, nullable=True)

    mapping_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    is_active = Column(Boolean, nullable=False, default=True)

    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

class IdocNumberRange(Base):
    __tablename__ = "idoc_number_range"

    client_id = Column(String(50), primary_key=True)
    prefix = Column(String(20))
    last_number = Column(BigInteger, nullable=False, default=0)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

class VendorLayoutLearning(Base):
    __tablename__ = "vendor_layout_learning"

    vendor_learning_id = Column(Integer, primary_key=True, index=True)
    client_id = Column(String, index=True, nullable=False)
    supplier_name = Column(String, index=True, nullable=True)

    fingerprint_hash = Column(String, index=True, nullable=True)
    fingerprint_json = Column(JSON, nullable=False, default={})

    mapping_profile_id = Column(String, nullable=True)
    learned_mapping_json = Column(JSON, nullable=False, default={})

    usage_count = Column(Integer, nullable=False, default=0)
    approved_count = Column(Integer, nullable=False, default=1)
    last_used_at = Column(DateTime, nullable=True)

    approved_by = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

class ClientEmailConfig(Base):
    __tablename__ = "client_email_configs"

    config_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(String, nullable=False)

    email_address = Column(String)
    email_password = Column(String)
    imap_host = Column(String)
    imap_port = Column(Integer, default=993)

    use_ssl = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

class BusinessVertical(Base):
    __tablename__ = "business_verticals"

    vertical_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    vertical_code = Column(String(100), nullable=False)
    vertical_name = Column(String(255), nullable=False)
    status = Column(String(30), nullable=False, default="ACTIVE")
    default_erp_name = Column(String(100))
    notes = Column(Text)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

class ClientConnection(Base):
    __tablename__ = "client_connections"

    connection_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    vertical_id = Column(UUID(as_uuid=True), ForeignKey("business_verticals.vertical_id", ondelete="CASCADE"), index=True)
    connection_name = Column(String(255), nullable=False)
    connection_type = Column(String(50), nullable=False)
    direction = Column(String(20), nullable=False)
    config_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

class ClientERPConfig(Base):
    __tablename__ = "client_erp_configs"

    erp_config_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    vertical_id = Column(UUID(as_uuid=True), ForeignKey("business_verticals.vertical_id", ondelete="CASCADE"), index=True)
    erp_name = Column(String(100), nullable=False)
    message_type = Column(String(100), nullable=False)
    message_version = Column(String(50))
    format_type = Column(String(50))
    direction = Column(String(20))
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

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


class AddressMaster(Base):
    __tablename__ = "address_master"

    address_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(String, nullable=False, index=True)
    partner_id = Column(UUID(as_uuid=True), ForeignKey("trading_partners.partner_id"), nullable=False, index=True)

    direction = Column(String, nullable=False)  # INBOUND / OUTBOUND
    partner_type = Column(String, nullable=False)  # CUSTOMER / SUPPLIER / etc
    role_code = Column(String, nullable=False)  # SHIP_TO / SOLD_TO / etc

    address_name = Column(String, nullable=True)
    address_line1 = Column(String, nullable=False)
    address_line2 = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    country = Column(String, nullable=True)

    ship_to_code = Column(String, nullable=True)
    sold_to_code = Column(String, nullable=True)
    bill_to_code = Column(String, nullable=True)
    supplier_code = Column(String, nullable=True)
    warehouse_code = Column(String, nullable=True)
    delivery_location_code = Column(String, nullable=True)

    is_active = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

class MessageFlow(Base):
    __tablename__ = "message_flows"

    flow_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    client_id = Column(String, nullable=False)
    vertical_id = Column(UUID(as_uuid=True), nullable=True)
    partner_id = Column(UUID(as_uuid=True), nullable=False)

    flow_name = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    priority = Column(Integer, default=100)

    document_type = Column(String, nullable=False)
    message_direction = Column(String, nullable=False)

    # -------- SOURCE --------
    source_format = Column(String, nullable=False)
    source_message_standard = Column(String, nullable=True)
    source_message_type = Column(String, nullable=True)
    source_message_version = Column(String, nullable=True)

    # -------- TARGET --------
    target_erp = Column(String, nullable=False)
    target_message_standard = Column(String, nullable=True)
    target_message_type = Column(String, nullable=True)
    target_message_version = Column(String, nullable=True)

    target_connection_id = Column(UUID(as_uuid=True), nullable=True)

    # -------- PROFILE REFERENCES --------
    mapping_profile_id = Column(UUID(as_uuid=True), nullable=True)
    rule_profile_id = Column(UUID(as_uuid=True), nullable=True)
    uom_profile_id = Column(UUID(as_uuid=True), nullable=True)
    address_profile_id = Column(UUID(as_uuid=True), nullable=True)
    parser_profile_id = Column(UUID(as_uuid=True), nullable=True)
    validation_profile_id = Column(UUID(as_uuid=True), nullable=True)

    # -------- EXECUTION FLAGS --------
    auto_send_on_success = Column(Boolean, default=True)
    requires_review_on_error = Column(Boolean, default=True)
    allow_partial_processing = Column(Boolean, default=False)

class ParserProfile(Base):
    __tablename__ = "parser_profiles"

    parser_profile_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    client_id = Column(String, nullable=False, index=True)
    partner_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    profile_name = Column(String, nullable=False)

    source_format = Column(String, nullable=True)         # PDF, X12, EDIFACT, XML, JSON, EXCEL
    source_message_type = Column(String, nullable=True)   # 850, ORDERS, etc.
    source_version = Column(String, nullable=True)        # 4010, 5010, D96A, D97A, etc.

    parser_config_json = Column(JSON, nullable=True)
    field_mapping_json = Column(JSON, nullable=True)

    is_active = Column(Boolean, nullable=False, default=True)
    priority = Column(Integer, nullable=False, default=100)

    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
