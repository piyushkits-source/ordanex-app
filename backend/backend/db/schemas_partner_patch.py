from pydantic import BaseModel
from typing import Optional, Any
from uuid import UUID
from datetime import datetime

class PartnerCreate(BaseModel):
    client_id: str
    vertical_id: Optional[UUID] = None
    partner_code: str
    partner_name: str
    partner_type: str = "CUSTOMER"
    status: str = "ACTIVE"
    notes: Optional[str] = None

class PartnerRead(PartnerCreate):
    partner_id: UUID
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class PartnerProfileCreate(BaseModel):
    partner_id: UUID
    duplicate_check_enabled: bool = True
    duplicate_check_scope: str = "PO_NUMBER"
    split_rule: str = "NONE"
    split_po_number_strategy: str = "SAME_PO_NUMBER"
    split_po_separator: str = "-"
    delivery_date_source: str = "PO_DELIVERY_DATE"
    delivery_date_offset_type: str = "NONE"
    delivery_date_offset_days: int = 0
    po_date_source: str = "PO_DATE"

class PartnerProfileRead(PartnerProfileCreate):
    onboarding_profile_id: UUID
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class PartnerConnectionCreate(BaseModel):
    partner_id: UUID
    connection_type: str
    direction: str
    config_json: Optional[dict[str, Any]] = {}
    is_active: bool = True

class PartnerConnectionRead(PartnerConnectionCreate):
    connection_id: UUID
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class PartnerUomRuleCreate(BaseModel):
    partner_id: UUID
    customer_code: Optional[str] = None
    supplier_code: Optional[str] = None
    ship_to_code: Optional[str] = None
    material_code: Optional[str] = None
    product_code: Optional[str] = None
    input_uom: str
    output_uom: str
    conversion_factor: Optional[float] = None
    conversion_divider: Optional[float] = None
    rounding_digits: int = 2
    priority: int = 100
    is_active: bool = True
    notes: Optional[str] = None

class PartnerUomRuleUpdate(BaseModel):
    customer_code: Optional[str] = None
    supplier_code: Optional[str] = None
    ship_to_code: Optional[str] = None
    material_code: Optional[str] = None
    product_code: Optional[str] = None
    input_uom: Optional[str] = None
    output_uom: Optional[str] = None
    conversion_factor: Optional[float] = None
    conversion_divider: Optional[float] = None
    rounding_digits: Optional[int] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None

class PartnerUomRuleRead(PartnerUomRuleCreate):
    uom_rule_id: UUID
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class PartnerFieldMappingCreate(BaseModel):
    partner_id: UUID
    source_field: str
    target_field: str
    transform_type: str = "DIRECT"
    transform_config: Optional[dict[str, Any]] = {}
    is_active: bool = True

class PartnerFieldMappingRead(PartnerFieldMappingCreate):
    mapping_id: UUID
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class PartnerNotificationCreate(BaseModel):
    partner_id: UUID
    email: str
    notification_type: str = "FAILED"
    include_attachment: bool = True
    is_active: bool = True

class PartnerNotificationRead(PartnerNotificationCreate):
    notification_id: UUID
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}
