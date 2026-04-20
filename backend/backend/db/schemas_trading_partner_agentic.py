from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

class PartnerAddressCreate(BaseModel):
    client_id: str
    partner_id: UUID
    partner_type: str
    direction: str
    address_role: str
    address_code: Optional[str] = None
    erp_address_code: Optional[str] = None
    name_1: Optional[str] = None
    address_line_1: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    is_active: bool = True

class PartnerAddressRead(BaseModel):
    address_id: UUID
    client_id: str
    partner_id: UUID
    partner_type: str
    direction: str
    address_role: str
    address_code: Optional[str] = None
    erp_address_code: Optional[str] = None
    name_1: Optional[str] = None
    address_line_1: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class MessageRegistryCreate(BaseModel):
    message_family: str
    message_standard: str
    message_version: Optional[str] = None
    canonical_code: Optional[str] = None
    parser_adapter: Optional[str] = None
    validation_adapter: Optional[str] = None
    direction: str = "INBOUND"
    is_active: bool = True
    notes: Optional[str] = None

class MessageRegistryRead(BaseModel):
    registry_id: UUID
    message_family: str
    message_standard: str
    message_version: Optional[str] = None
    canonical_code: Optional[str] = None
    parser_adapter: Optional[str] = None
    validation_adapter: Optional[str] = None
    direction: str
    is_active: bool
    notes: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class AgenticProjectCreate(BaseModel):
    client_id: str
    partner_id: UUID
    profile_name: str
    message_family: str
    message_standard: str
    message_version: Optional[str] = None
    direction: str = "INBOUND"
    target_message_family: Optional[str] = None
    extraction_mode: Optional[str] = "HYBRID_AI_OCR"
    sample_reference: Optional[str] = None

class AgenticProjectRead(BaseModel):
    project_id: UUID
    client_id: str
    partner_id: UUID
    profile_name: str
    message_family: str
    message_standard: str
    message_version: Optional[str] = None
    direction: str
    target_message_family: Optional[str] = None
    extraction_mode: Optional[str] = None
    sample_reference: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class AgenticDiscoveryRequest(BaseModel):
    client_id: str
    partner_id: UUID
    profile_name: str
    message_family: str
    message_standard: str
    message_version: Optional[str] = None
    direction: str = "INBOUND"
    target_message_family: Optional[str] = None
    extraction_mode: Optional[str] = "HYBRID_AI_OCR"
    sample_reference: Optional[str] = None

class AgenticDiscoveryResponse(BaseModel):
    detected_standard: str = Field(alias="message_standard")
    message_version: Optional[str] = None
    recommended_extraction_mode: Optional[str] = None
    suggested_mapping_strategy: Optional[str] = None
    notes: list[str] = Field(default_factory=list)
