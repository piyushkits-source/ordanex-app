
from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field

# Add these schemas to backend/db/schemas.py

class ClientConfigVersionCreate(BaseModel):
    client_id: str
    config_type: str
    config_key: str = "default"
    config_value_json: dict = Field(default_factory=dict)
    change_summary: str | None = None

class ClientConfigVersionRead(BaseModel):
    config_version_id: Any
    client_id: str
    config_type: str
    config_key: str
    version_no: int
    config_value_json: dict = Field(default_factory=dict)
    validation_status: str
    validation_errors: list = Field(default_factory=list)
    change_summary: str | None = None
    is_active: bool
    created_by: str | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
