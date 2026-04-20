from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TradingPartnerUomRuleBase(BaseModel):
    client_id: str
    partner_id: UUID
    sold_to: str | None = None
    ship_to: str | None = None
    material_code: str | None = None
    product_code: str | None = None
    input_uom: str
    output_uom: str
    conversion_factor: Decimal | None = None
    conversion_divider: Decimal | None = None
    rounding_digits: int = 2
    rounding_mode: str = "HALF_UP"
    min_quantity: Decimal | None = None
    max_quantity: Decimal | None = None
    priority: int = 100
    is_active: bool = True
    notes: str | None = None
    created_by: str | None = None
    updated_by: str | None = None


class TradingPartnerUomRuleCreate(TradingPartnerUomRuleBase):
    pass


class TradingPartnerUomRuleUpdate(BaseModel):
    sold_to: str | None = None
    ship_to: str | None = None
    material_code: str | None = None
    product_code: str | None = None
    input_uom: str | None = None
    output_uom: str | None = None
    conversion_factor: Decimal | None = None
    conversion_divider: Decimal | None = None
    rounding_digits: int | None = None
    rounding_mode: str | None = None
    min_quantity: Decimal | None = None
    max_quantity: Decimal | None = None
    priority: int | None = None
    is_active: bool | None = None
    notes: str | None = None
    updated_by: str | None = None


class TradingPartnerUomRuleRead(TradingPartnerUomRuleBase):
    uom_rule_id: UUID
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class TradingPartnerBusinessRuleBase(BaseModel):
    client_id: str
    partner_id: UUID
    rule_name: str
    rule_type: str = "TRANSFORMATION"
    document_type: str = "PO"
    message_direction: str = "INBOUND"
    sold_to: str | None = None
    ship_to: str | None = None
    material_code: str | None = None
    condition_json: dict[str, Any] = Field(default_factory=dict)
    action_json: dict[str, Any] = Field(default_factory=dict)
    priority: int = 100
    stop_on_match: bool = False
    is_active: bool = True
    notes: str | None = None
    created_by: str | None = None
    updated_by: str | None = None


class TradingPartnerBusinessRuleCreate(TradingPartnerBusinessRuleBase):
    pass


class TradingPartnerBusinessRuleUpdate(BaseModel):
    rule_name: str | None = None
    rule_type: str | None = None
    document_type: str | None = None
    message_direction: str | None = None
    sold_to: str | None = None
    ship_to: str | None = None
    material_code: str | None = None
    condition_json: dict[str, Any] | None = None
    action_json: dict[str, Any] | None = None
    priority: int | None = None
    stop_on_match: bool | None = None
    is_active: bool | None = None
    notes: str | None = None
    updated_by: str | None = None


class TradingPartnerBusinessRuleRead(TradingPartnerBusinessRuleBase):
    rule_id: UUID
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class TradingPartnerMappingProfileBase(BaseModel):
    client_id: str
    partner_id: UUID
    profile_name: str
    document_type: str = "PO"
    input_format: str = "PDF"
    source_channel: str | None = None
    sold_to: str | None = None
    ship_to: str | None = None
    field_mapping_json: dict[str, Any] = Field(default_factory=dict)
    header_defaults_json: dict[str, Any] = Field(default_factory=dict)
    line_mapping_json: dict[str, Any] = Field(default_factory=dict)
    validation_json: dict[str, Any] = Field(default_factory=dict)
    layout_hint_json: dict[str, Any] = Field(default_factory=dict)
    ai_prompt_override: str | None = None
    version_no: int = 1
    priority: int = 100
    is_default: bool = False
    is_active: bool = True
    notes: str | None = None
    created_by: str | None = None
    updated_by: str | None = None


class TradingPartnerMappingProfileCreate(TradingPartnerMappingProfileBase):
    pass


class TradingPartnerMappingProfileUpdate(BaseModel):
    profile_name: str | None = None
    document_type: str | None = None
    input_format: str | None = None
    source_channel: str | None = None
    sold_to: str | None = None
    ship_to: str | None = None
    field_mapping_json: dict[str, Any] | None = None
    header_defaults_json: dict[str, Any] | None = None
    line_mapping_json: dict[str, Any] | None = None
    validation_json: dict[str, Any] | None = None
    layout_hint_json: dict[str, Any] | None = None
    ai_prompt_override: str | None = None
    version_no: int | None = None
    priority: int | None = None
    is_default: bool | None = None
    is_active: bool | None = None
    notes: str | None = None
    updated_by: str | None = None


class TradingPartnerMappingProfileRead(TradingPartnerMappingProfileBase):
    mapping_profile_id: UUID
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class TradingPartnerOnboardingAuditRead(BaseModel):
    audit_id: UUID
    client_id: str
    partner_id: UUID
    entity_type: str
    entity_id: str
    action: str
    before_json: dict[str, Any] | None = None
    after_json: dict[str, Any] | None = None
    actor_email: str | None = None
    actor_role: str | None = None
    remarks: str | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
