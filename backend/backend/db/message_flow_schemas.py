from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class TradingPartnerMessageFlowBase(BaseModel):
    client_id: str
    vertical_id: Optional[UUID] = None
    partner_id: UUID

    flow_name: str
    is_active: bool = True
    priority: int = 100

    document_type: str
    message_direction: str

    source_format: str = "PDF"
    source_message_standard: Optional[str] = None
    source_message_type: Optional[str] = None
    source_message_version: Optional[str] = None

    target_erp: str
    target_message_standard: str
    target_message_type: str
    target_message_version: Optional[str] = None

    target_connection_id: Optional[UUID] = None

    mapping_profile_id: Optional[UUID] = None
    rules_profile_id: Optional[UUID] = None
    uom_profile_id: Optional[UUID] = None
    address_profile_id: Optional[UUID] = None
    parser_profile_id: Optional[UUID] = None
    validation_profile_id: Optional[UUID] = None

    requires_review_on_error: bool = True
    auto_send_on_success: bool = False
    allow_partial_processing: bool = False
    archive_mode: Optional[str] = None

    flow_notes: Optional[str] = None


class TradingPartnerMessageFlowCreate(TradingPartnerMessageFlowBase):
    pass


class TradingPartnerMessageFlowUpdate(BaseModel):
    flow_name: Optional[str] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = None

    document_type: Optional[str] = None
    message_direction: Optional[str] = None

    source_format: Optional[str] = None
    source_message_standard: Optional[str] = None
    source_message_type: Optional[str] = None
    source_message_version: Optional[str] = None

    target_erp: Optional[str] = None
    target_message_standard: Optional[str] = None
    target_message_type: Optional[str] = None
    target_message_version: Optional[str] = None

    target_connection_id: Optional[UUID] = None

    mapping_profile_id: Optional[UUID] = None
    rules_profile_id: Optional[UUID] = None
    uom_profile_id: Optional[UUID] = None
    address_profile_id: Optional[UUID] = None
    parser_profile_id: Optional[UUID] = None
    validation_profile_id: Optional[UUID] = None

    requires_review_on_error: Optional[bool] = None
    auto_send_on_success: Optional[bool] = None
    allow_partial_processing: Optional[bool] = None
    archive_mode: Optional[str] = None
    flow_notes: Optional[str] = None


class TradingPartnerMessageFlowRead(TradingPartnerMessageFlowBase):
    flow_id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
