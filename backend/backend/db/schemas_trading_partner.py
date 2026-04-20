from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


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
