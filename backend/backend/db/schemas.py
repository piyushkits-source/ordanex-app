from __future__ import annotations
from uuid import UUID

from datetime import datetime, date
from typing import Optional, List, Dict, Any
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# =========================================================
# CLIENT
# =========================================================

class ClientCreate(BaseModel):
    client_id: str
    client_name: str
    status: Optional[str] = "ACTIVE"
    subscription_type: Optional[str] = None
    default_currency: Optional[str] = None
    default_vendor: Optional[str] = None
    default_sold_to: Optional[str] = None
    default_ship_to: Optional[str] = None

class ClientUpdate(BaseModel):
    client_name: Optional[str] = None
    status: Optional[str] = None
    subscription_type: Optional[str] = None
    default_currency: Optional[str] = None
    default_vendor: Optional[str] = None
    default_sold_to: Optional[str] = None
    default_ship_to: Optional[str] = None

class ClientRead(ClientCreate):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    model_config = {"from_attributes": True}

class VerticalCreate(BaseModel):
    client_id: str
    vertical_code: str
    vertical_name: str
    status: Optional[str] = "ACTIVE"
    default_erp_name: Optional[str] = None
    notes: Optional[str] = None

class VerticalUpdate(BaseModel):
    vertical_name: Optional[str] = None
    status: Optional[str] = None
    default_erp_name: Optional[str] = None
    notes: Optional[str] = None

class VerticalRead(VerticalCreate):
    vertical_id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    model_config = {"from_attributes": True}

class ClientConnectionCreate(BaseModel):
    client_id: str
    vertical_id: Optional[UUID] = None
    connection_name: str
    connection_type: str
    direction: str
    config_json: Optional[dict[str, Any]] = {}
    is_active: Optional[bool] = True

class ClientConnectionUpdate(BaseModel):
    connection_name: Optional[str] = None
    connection_type: Optional[str] = None
    direction: Optional[str] = None
    config_json: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None

class ClientConnectionRead(ClientConnectionCreate):
    connection_id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    model_config = {"from_attributes": True}

class ClientERPConfigCreate(BaseModel):
    client_id: str
    vertical_id: Optional[UUID] = None
    erp_name: str
    message_type: str
    message_version: Optional[str] = None
    format_type: Optional[str] = None
    direction: Optional[str] = None
    is_active: Optional[bool] = True

class ClientERPConfigUpdate(BaseModel):
    erp_name: Optional[str] = None
    message_type: Optional[str] = None
    message_version: Optional[str] = None
    format_type: Optional[str] = None
    direction: Optional[str] = None
    is_active: Optional[bool] = None

class ClientERPConfigRead(ClientERPConfigCreate):
    erp_config_id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    model_config = {"from_attributes": True}

class ClientSyncEventCreate(BaseModel):
    client_id: str
    sync_key: str
    event_type: str = "HEALTH_CHECK"
    status: str = "UNKNOWN"
    message: str | None = None
    endpoint_url: str | None = None
    source_system: str | None = None
    target_system: str | None = None
    records_synced: int = 0
    duration_ms: int | None = None
    last_synced_at: datetime | None = None
    details_json: dict[str, Any] = Field(default_factory=dict)


class ClientSyncEventRead(ClientSyncEventCreate):
    sync_event_id: UUID
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


class TradingPartnerCreate(BaseModel):
    client_id: str
    vertical_id: UUID | None = None
    partner_code: str
    partner_name: str
    partner_type: str
    status: str = "ACTIVE"
    connection_method: str | None = None
    email: str | None = None
    edi_id: str | None = None
    sftp_path: str | None = None
    as2_id: str | None = None
    api_reference: str | None = None
    notes: str | None = None


class TradingPartnerUpdate(BaseModel):
    vertical_id: UUID | None = None
    partner_code: str | None = None
    partner_name: str | None = None
    partner_type: str | None = None
    status: str | None = None
    connection_method: str | None = None
    email: str | None = None
    edi_id: str | None = None
    sftp_path: str | None = None
    as2_id: str | None = None
    api_reference: str | None = None
    notes: str | None = None


class TradingPartnerRead(TradingPartnerCreate):
    partner_id: UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class TradingPartnerProfileCreate(BaseModel):
    client_id: str
    partner_id: UUID
    profile_name: str = "Default Profile"
    profile_status: str = "ACTIVE"
    duplicate_check_enabled: bool = True
    duplicate_check_scope: str = "PO_NUMBER"
    split_rule: str = "NONE"
    split_po_number_strategy: str = "SAME_PO_NUMBER"
    split_po_separator: str = "-"
    delivery_date_source: str = "PO_DELIVERY_DATE"
    delivery_date_offset_type: str = "NONE"
    delivery_date_offset_days: int = 0
    po_date_source: str = "PO_DATE"
    max_split_quantity: float | None = None
    max_split_uom: str | None = None
    split_quantity_basis: str | None = None
    split_rounding_mode: str | None = None
    split_po_prefix: str | None = None
    split_po_suffix: str | None = None
    split_po_format: str | None = None


class TradingPartnerProfileRead(TradingPartnerProfileCreate):
    onboarding_profile_id: UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class TradingPartnerConnectionCreate(BaseModel):
    client_id: str
    partner_id: UUID
    connection_name: str
    connection_type: str
    direction: str
    message_type: str | None = None
    message_version: str | None = None
    config_json: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True


class TradingPartnerConnectionUpdate(BaseModel):
    connection_name: str | None = None
    connection_type: str | None = None
    direction: str | None = None
    message_type: str | None = None
    message_version: str | None = None
    config_json: dict[str, Any] | None = None
    is_active: bool | None = None


class TradingPartnerConnectionRead(TradingPartnerConnectionCreate):
    connection_id: UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}

# =========================================================
# USER / AUTH
# =========================================================

class UserCreate(BaseModel):
    client_id: str | None = None
    environment: str | None = None
    email: EmailStr
    password: str
    role: str
    is_active: bool = True


class UserUpdate(BaseModel):
    client_id: str | None = None
    environment: str | None = None
    email: EmailStr | None = None
    password: str | None = None
    role: str | None = None
    is_active: bool | None = None


class UserStatusUpdate(BaseModel):
    is_active: bool


class UserRead(BaseModel):
    user_id: Any
    client_id: str | None = None
    environment: str | None = None
    email: EmailStr
    role: str
    is_active: bool
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: Any
    email: EmailStr
    role: str
    client_id: str | None = None
    environment: str | None = None
    subscription_type: str | None = None
    feature_flags: list[str] = Field(default_factory=list)
    disabled_feature_flags: list[str] = Field(default_factory=list)
    disabled_feature_flags: list[str] = Field(default_factory=list)

# =========================================================
# MAPPINGS
# =========================================================

class BBox(BaseModel):
    x: float
    y: float
    width: float
    height: float
    page: Optional[int] = 1

class MappingUpdate(BaseModel):
    key: str
    value: Optional[str] = None
    text: Optional[str] = None
    bbox: Optional[BBox] = None
    source: Optional[str] = None
    confidence: Optional[float] = None

class MappingRead(BaseModel):
    key: str
    value: Optional[str] = None
    text: Optional[str] = None
    bbox: Optional[Dict[str, Any]] = None
    source: Optional[str] = None
    confidence: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


# =========================================================
# PURCHASE ORDER ITEMS
# =========================================================

class PurchaseOrderItemCreate(BaseModel):
    line_no: int
    material_code: str | None = None
    description: str | None = None
    quantity: float | None = None
    uom: str | None = None
    unit_price: float | None = None
    amount: float | None = None
    delivery_date: date | None = None
    plant: str | None = None
    is_corrected: bool = False


class PurchaseOrderItemUpdate(BaseModel):
    line_no: int | None = None
    material_code: str | None = None
    description: str | None = None
    quantity: float | None = None
    uom: str | None = None
    unit_price: float | None = None
    amount: float | None = None
    delivery_date: date | None = None
    plant: str | None = None
    is_corrected: bool = True


class PurchaseOrderItemRead(PurchaseOrderItemCreate):
    po_item_id: Any
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# =========================================================
# PURCHASE ORDER
# =========================================================

class PurchaseOrderRead(BaseModel):
    po_id: Any
    client_id: str
    file_id: UUID | None

    po_number: str | None = None
    original_po_number: str | None = None
    split_key: str | None = None
    split_sequence: int | None = None

    po_date: date | None = None
    supplier_name: str | None = None
    currency: str | None = None
    po_type: str | None = None
    order_type: str | None = None
    sold_to: str | None = None
    ship_to: str | None = None
    language_code: str | None = None

    inbound_message_id: Any | None = None
    needs_review: bool | None = None
    review_status: str | None = None
    dispatch_status: str | None = None
    ack_status: str | None = None
    correlation_id: Any | None = None

    status: str
    source_type: str
    po_confidence: str | None = None
    po_validation_reason: str | None = None

    xml_payload: str | None = None
    raw_text: str | None = None

    total_items: int
    retry_count: int
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime

    transaction_id: str | None = None
    environment: str | None = None
    direction: str | None = None
    sender: str | None = None
    receiver: str | None = None
    received_at: datetime | None = None
    processed_at: datetime | None = None
    delivered_at: datetime | None = None

    items: list[PurchaseOrderItemRead] = Field(default_factory=list)
    mappings: list[MappingRead] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class PurchaseOrderUpdate(BaseModel):
    po_number: Optional[str] = None
    po_date: Optional[str] = None
    sender: Optional[str] = None
    receiver: Optional[str] = None
    po_type: Optional[str] = None
    order_type: Optional[str] = None
    language_code: Optional[str] = None
    currency: Optional[str] = None
    ship_to: Optional[str] = None
    ship_to_name: Optional[str] = None
    ship_to_address: Optional[str] = None
    header_details: Optional[str] = None
    sold_to: Optional[str] = None
    po_validation_reason: Optional[str] = None
    raw_text: Optional[str] = None
    items: Optional[List[PurchaseOrderItemUpdate]] = None
    mappings: Optional[List[MappingUpdate]] = None


class BuyerPortalCatalogItem(BaseModel):
    sku: str
    name: str
    description: str | None = None
    details: str | None = None
    category: str | None = None
    brand: str | None = None
    unit_price: float
    currency: str = "USD"
    uom: str = "EA"
    image_url: str | None = None
    video_url: str | None = None
    media: list[dict[str, Any]] | None = None
    stock_status: str | None = "Available"
    lead_time: str | None = None
    min_order_qty: float | None = None
    moq_uom: str | None = None
    payment_terms: str | None = None
    supplier_name: str | None = None
    specifications: dict[str, str] | None = None


class BuyerPortalOrderItem(BaseModel):
    sku: str
    name: str | None = None
    description: str | None = None
    quantity: float
    unit_price: float
    uom: str = "EA"
    delivery_date: date | None = None


class BuyerPortalOrderCreate(BaseModel):
    client_id: str
    buyer_name: str
    buyer_email: str
    company_name: str | None = None
    sold_to: str | None = None
    ship_to: str | None = None
    ship_to_name: str | None = None
    ship_to_address: str | None = None
    currency: str | None = None
    notes: str | None = None
    payment_method: str | None = None
    payment_reference: str | None = None
    payment_proof_name: str | None = None
    payment_proof_url: str | None = None
    payment_proof_storage_key: str | None = None
    payment_proof_data_url: str | None = None
    items: list[BuyerPortalOrderItem] = Field(default_factory=list)


class BuyerPortalInvoiceDetails(BaseModel):
    invoice_number: str | None = None
    invoice_date: str | None = None
    invoice_amount: float | None = None
    currency: str | None = None
    due_date: str | None = None
    payment_status: str | None = None
    invoice_url: str | None = None
    invoice_file_name: str | None = None
    invoice_storage_key: str | None = None
    invoice_file_data_url: str | None = None
    invoice_notes: str | None = None


class BuyerPortalShipmentDetails(BaseModel):
    shipment_number: str | None = None
    shipment_status: str | None = None
    carrier: str | None = None
    tracking_number: str | None = None
    tracking_url: str | None = None
    shipment_document_name: str | None = None
    shipment_document_url: str | None = None
    shipment_document_storage_key: str | None = None
    shipment_document_data_url: str | None = None
    ship_date: str | None = None
    estimated_delivery_date: str | None = None
    delivered_date: str | None = None
    shipment_notes: str | None = None


class BuyerPortalPaymentDetails(BaseModel):
    payment_method: str | None = None
    payment_reference: str | None = None
    payment_status: str | None = None
    payment_proof_name: str | None = None
    payment_proof_url: str | None = None
    payment_proof_storage_key: str | None = None
    payment_proof_data_url: str | None = None
    payment_proof_uploaded_at: str | None = None


class BuyerPortalOrderRead(PurchaseOrderRead):
    buyer_name: str | None = None
    buyer_email: str | None = None
    company_name: str | None = None
    payment_method: str | None = None
    payment_reference: str | None = None
    payment_status: str | None = None
    payment_proof_name: str | None = None
    payment_proof_url: str | None = None
    payment_proof_storage_key: str | None = None
    payment_proof_data_url: str | None = None
    payment: BuyerPortalPaymentDetails | None = None
    invoice: BuyerPortalInvoiceDetails | None = None
    shipment: BuyerPortalShipmentDetails | None = None
    tracking_steps: list[dict[str, Any]] = Field(default_factory=list)


class BuyerPortalOrderCommerceUpdate(BaseModel):
    payment: BuyerPortalPaymentDetails | None = None
    invoice: BuyerPortalInvoiceDetails | None = None
    shipment: BuyerPortalShipmentDetails | None = None

# =========================================================
# REPROCESS / NOTIFICATION
# =========================================================

class ReprocessRequest(BaseModel):
    mock_mode: bool | None = None
    triggered_by: str | None = None
    target_erp: str | None = None
    message_type: str | None = None
    message_version: str | None = None
    connection_id: str | None = None


class ReprocessResponse(BaseModel):
    po_id: Any
    status: str
    retry_count: int
    message: str
    xml_payload: str | None = None


class EmailTriggerRequest(BaseModel):
    event_type: str
    recipients: list[str] = Field(default_factory=list)
    subject: str
    body_html: str
    created_by: str | None = None


class EmailTriggerResponse(BaseModel):
    status: str
    message: str


# =========================================================
# LOGS
# =========================================================

class PoLogRead(BaseModel):
    log_id: Any
    po_id: Any
    client_id: str
    level: str
    stage: str
    message: str
    error_type: str | None = None
    created_by: str | None = None
    log_time: datetime

    model_config = ConfigDict(from_attributes=True)


# =========================================================
# JOBS
# =========================================================

class JobCreateRequest(BaseModel):
    client_id: str
    job_type: str
    po_id: Any | None = None
    file_id: Any | None = None
    priority: int = 100
    requested_by: str | None = None
    payload_json: dict = Field(default_factory=dict)


class JobReadResponse(BaseModel):
    job_id: Any
    client_id: str
    file_id: Any | None = None
    po_id: Any | None = None
    job_type: str
    status: str
    priority: int
    requested_by: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error_message: str | None = None
    payload_json: dict = Field(default_factory=dict)
    result_json: dict = Field(default_factory=dict)
    attempts: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# =========================================================
# FILES
# =========================================================

class FileReadResponse(BaseModel):
    file_id: Any
    client_id: str
    original_file_name: str
    mime_type: str | None = None
    file_path: str | None = None
    file_size_bytes: int | None = None
    uploaded_by: str | None = None
    uploaded_at: datetime
    checksum: str | None = None

    model_config = ConfigDict(from_attributes=True)


class PoFileInfoResponse(BaseModel):
    po_id: Any
    po_number: str | None = None
    file: FileReadResponse | None = None

class PartnerUomRuleBase(BaseModel):
    client_id: str
    partner_id: UUID

    customer_code: Optional[str] = None
    supplier_code: Optional[str] = None
    ship_to_code: Optional[str] = None
    material_code: Optional[str] = None
    product_code: Optional[str] = None

    input_uom: str
    output_uom: str

    conversion_factor: Optional[Decimal] = None
    conversion_divider: Optional[Decimal] = None
    rounding_digits: int = 2
    priority: int = 100

    is_active: bool = True
    notes: Optional[str] = None


class PartnerUomRuleCreate(PartnerUomRuleBase):
    pass


class PartnerUomRuleUpdate(BaseModel):
    customer_code: Optional[str] = None
    supplier_code: Optional[str] = None
    ship_to_code: Optional[str] = None
    material_code: Optional[str] = None
    product_code: Optional[str] = None

    input_uom: Optional[str] = None
    output_uom: Optional[str] = None

    conversion_factor: Optional[Decimal] = None
    conversion_divider: Optional[Decimal] = None
    rounding_digits: Optional[int] = None
    priority: Optional[int] = None

    is_active: Optional[bool] = None
    notes: Optional[str] = None


class PartnerUomRuleRead(PartnerUomRuleBase):
    uom_rule_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# =========================================================
# MAPPING PROFILES
# =========================================================

class MappingProfileCreate(BaseModel):
    client_id: str
    partner_id: str | None = None
    profile_name: str
    sold_to: str | None = None
    ship_to: str | None = None
    parent_profile_id: Any | None = None
    priority: int = 100
    description: str | None = None
    mapping_json: dict = Field(default_factory=dict)
    is_active: bool = True


class MappingProfileUpdate(BaseModel):
    client_id: str | None = None
    partner_id: str | None = None
    profile_name: str | None = None
    sold_to: str | None = None
    ship_to: str | None = None
    parent_profile_id: Any | None = None
    priority: int | None = None
    description: str | None = None
    mapping_json: dict | None = None
    is_active: bool | None = None


class MappingProfileRead(BaseModel):
    mapping_profile_id: Any
    client_id: str
    partner_id: str | None = None
    profile_name: str
    sold_to: str | None = None
    ship_to: str | None = None
    parent_profile_id: Any | None = None
    priority: int
    description: str | None = None
    mapping_json: dict = Field(default_factory=dict)
    is_active: bool
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# =========================================================
# VENDOR LAYOUT LEARNING
# =========================================================

class VendorLayoutLearningBase(BaseModel):
    client_id: str
    supplier_name: str | None = None
    mapping_profile_name: str
    layout_fingerprint_json: dict[str, Any] = Field(default_factory=dict)
    learned_mapping_json: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    created_by: str | None = None


class VendorLayoutLearningCreate(VendorLayoutLearningBase):
    pass


class VendorLayoutLearningUpdate(BaseModel):
    supplier_name: str | None = None
    mapping_profile_name: str | None = None
    layout_fingerprint_json: dict[str, Any] | None = None
    learned_mapping_json: dict[str, Any] | None = None
    usage_count: int | None = None
    is_active: bool | None = None


class VendorLayoutLearningResponse(BaseModel):
    learning_id: str
    client_id: str
    supplier_name: str | None = None
    mapping_profile_name: str
    fingerprint_hash: str
    layout_fingerprint_json: dict[str, Any]
    learned_mapping_json: dict[str, Any]
    usage_count: int
    last_used_at: datetime | None = None
    is_active: bool
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class InboundMessageRead(BaseModel):
    inbound_message_id: Any
    client_id: str
    message_type: str
    source_channel: str
    source_format: str | None = None
    sender: str | None = None
    receiver: str | None = None
    status: str
    received_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ParserProfileBase(BaseModel):
    client_id: str
    partner_id: UUID
    profile_name: str

    source_format: str | None = None
    source_message_type: str | None = None
    source_version: str | None = None

    parser_config_json: dict | None = None
    field_mapping_json: dict | None = None

    is_active: bool = True
    priority: int = 100


class ParserProfileCreate(ParserProfileBase):
    pass


class ParserProfileUpdate(BaseModel):
    profile_name: str | None = None

    source_format: str | None = None
    source_message_type: str | None = None
    source_version: str | None = None

    parser_config_json: dict | None = None
    field_mapping_json: dict | None = None

    is_active: bool | None = None
    priority: int | None = None


class ParserProfileRead(ParserProfileBase):
    parser_profile_id: UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True

class OutboundMessageRead(BaseModel):
    outbound_message_id: Any
    client_id: str
    po_id: Any | None
    target_protocol: str | None
    status: str
    attempt_count: int

    model_config = ConfigDict(from_attributes=True)

class AddressMasterBase(BaseModel):
    client_id: str
    partner_id: UUID
    direction: str
    partner_type: str
    role_code: str

    address_name: Optional[str] = None
    address_line1: str
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None

    ship_to_code: Optional[str] = None
    sold_to_code: Optional[str] = None
    bill_to_code: Optional[str] = None
    supplier_code: Optional[str] = None
    warehouse_code: Optional[str] = None
    delivery_location_code: Optional[str] = None

    is_active: bool = True
    notes: Optional[str] = None


class AddressMasterCreate(AddressMasterBase):
    pass


class AddressMasterRead(AddressMasterBase):
    address_id: UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True

class AddressMatchPreviewRequest(BaseModel):
    partner_id: UUID
    source_address_text: str
    direction: str | None = None
    partner_type: str | None = None
    role_code: str | None = None
    top_n: int = 5

class MessageFlowBase(BaseModel):
    client_id: str
    vertical_id: Optional[UUID]
    partner_id: UUID

    flow_name: str
    is_active: bool = True
    priority: int = 100

    document_type: str
    message_direction: str

    source_format: str
    source_message_standard: Optional[str]
    source_message_type: Optional[str]
    source_message_version: Optional[str]

    target_erp: str
    target_message_standard: Optional[str]
    target_message_type: Optional[str]
    target_message_version: Optional[str]

    target_connection_id: Optional[UUID]

    mapping_profile_id: Optional[UUID]
    rule_profile_id: Optional[UUID]
    uom_profile_id: Optional[UUID]
    address_profile_id: Optional[UUID]
    parser_profile_id: Optional[UUID]
    validation_profile_id: Optional[UUID]

    auto_send_on_success: bool = True
    requires_review_on_error: bool = True
    allow_partial_processing: bool = False


class MessageFlowCreate(MessageFlowBase):
    pass


class MessageFlowUpdate(BaseModel):
    flow_name: Optional[str]
    is_active: Optional[bool]
    priority: Optional[int]

    document_type: Optional[str]
    message_direction: Optional[str]

    source_format: Optional[str]
    source_message_standard: Optional[str]
    source_message_type: Optional[str]
    source_message_version: Optional[str]

    target_erp: Optional[str]
    target_message_standard: Optional[str]
    target_message_type: Optional[str]
    target_message_version: Optional[str]

    target_connection_id: Optional[UUID]

    mapping_profile_id: Optional[UUID]
    rule_profile_id: Optional[UUID]
    uom_profile_id: Optional[UUID]
    address_profile_id: Optional[UUID]
    parser_profile_id: Optional[UUID]
    validation_profile_id: Optional[UUID]

    auto_send_on_success: Optional[bool]
    requires_review_on_error: Optional[bool]
    allow_partial_processing: Optional[bool]


class MessageFlowRead(MessageFlowBase):
    flow_id: UUID

    class Config:
        from_attributes = True

# =========================================================
# MODEL REBUILD (Pydantic v2 safety)
# =========================================================

ClientRead.model_rebuild()
UserRead.model_rebuild()
LoginResponse.model_rebuild()

PurchaseOrderItemCreate.model_rebuild()
PurchaseOrderItemUpdate.model_rebuild()
PurchaseOrderItemRead.model_rebuild()

PurchaseOrderRead.model_rebuild()
PurchaseOrderUpdate.model_rebuild()

ReprocessRequest.model_rebuild()
ReprocessResponse.model_rebuild()

EmailTriggerRequest.model_rebuild()
EmailTriggerResponse.model_rebuild()

PoLogRead.model_rebuild()

JobCreateRequest.model_rebuild()
JobReadResponse.model_rebuild()

FileReadResponse.model_rebuild()
PoFileInfoResponse.model_rebuild()

MappingProfileCreate.model_rebuild()
MappingProfileUpdate.model_rebuild()
MappingProfileRead.model_rebuild()

VendorLayoutLearningBase.model_rebuild()
VendorLayoutLearningCreate.model_rebuild()
VendorLayoutLearningUpdate.model_rebuild()
VendorLayoutLearningResponse.model_rebuild()
