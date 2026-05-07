from datetime import datetime
from typing import Optional, Any
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
    invoice_profile_type: Optional[str] = None
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
    invoice_profile_type: Optional[str] = None
    extraction_mode: Optional[str] = None
    sample_reference: Optional[str] = None
    status: str
    current_stage: str
    objective: Optional[str] = None
    approval_status: str
    conversation_summary: Optional[str] = None
    recommended_actions: list[str] = Field(default_factory=list)
    requirements_json: dict[str, Any] = Field(default_factory=dict)
    test_plan_json: dict[str, Any] = Field(default_factory=dict)
    test_results_json: dict[str, Any] = Field(default_factory=dict)
    progress_steps: list[dict[str, str]] = Field(default_factory=list)
    discovery_json: dict[str, Any] = Field(default_factory=dict)
    extraction_profile_json: dict[str, Any] = Field(default_factory=dict)
    address_match_profile_json: dict[str, Any] = Field(default_factory=dict)
    mapping_profile_json: dict[str, Any] = Field(default_factory=dict)
    rule_profile_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class AgenticProjectUpdate(BaseModel):
    objective: Optional[str] = None
    conversation_summary: Optional[str] = None
    approval_status: Optional[str] = None
    recommended_actions: Optional[list[str]] = None
    requirements_json: Optional[dict[str, Any]] = None
    test_plan_json: Optional[dict[str, Any]] = None
    test_results_json: Optional[dict[str, Any]] = None
    extraction_profile_json: Optional[dict[str, Any]] = None
    address_match_profile_json: Optional[dict[str, Any]] = None
    mapping_profile_json: Optional[dict[str, Any]] = None
    rule_profile_json: Optional[dict[str, Any]] = None

class AgenticProjectAdvance(BaseModel):
    target_stage: Optional[str] = None
    summary_note: Optional[str] = None
    recommended_actions: Optional[list[str]] = None
    approval_status: Optional[str] = None

class AgenticDiscoveryRequest(BaseModel):
    client_id: str
    partner_id: UUID
    profile_name: str
    message_family: str
    message_standard: str
    message_version: Optional[str] = None
    direction: str = "INBOUND"
    target_message_family: Optional[str] = None
    invoice_profile_type: Optional[str] = None
    extraction_mode: Optional[str] = "HYBRID_AI_OCR"
    sample_reference: Optional[str] = None

class AgenticDiscoveryResponse(BaseModel):
    detected_standard: str = Field(alias="message_standard")
    message_version: Optional[str] = None
    recommended_extraction_mode: Optional[str] = None
    suggested_mapping_strategy: Optional[str] = None
    notes: list[str] = Field(default_factory=list)
