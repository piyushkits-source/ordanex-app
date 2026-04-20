from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class MonitoringQueueItem(BaseModel):
    po_id: UUID
    file_id: UUID | None = None
    client_id: str

    po_number: str | None = None
    docnum: str | None = None
    supplier_name: str | None = None
    status: str | None = None
    sender: str | None = None
    receiver: str | None = None
    direction: str | None = None
    environment: str | None = None
    source_type: str | None = None

    created_at: datetime | None = None
    received_at: datetime | None = None

    file_url: str | None = None
    mime_type: str | None = None
    file_name: str | None = None

    raw_text: str | None = None
    xml_payload: str | None = None

    items: list[dict[str, Any]] = Field(default_factory=list)
    mappings: list[dict[str, Any]] = Field(default_factory=list)

    sold_to_partner: dict[str, Any] | None = None
    ship_to_partner: dict[str, Any] | None = None
    delivery_partner: dict[str, Any] | None = None

    class Config:
        from_attributes = True


class ArchivePurchaseOrderRequest(BaseModel):
    reason: str
    comment: str | None = None


class ActionResponse(BaseModel):
    status: str
    message: str


class ActivityLogRead(BaseModel):
    id: str
    stage: str
    level: str
    message: str
    actor_type: str | None = None
    actor_email: str | None = None
    changed_fields: dict[str, Any] | None = None
    recipients: list[str] | None = None
    timestamp: str


class ProcessingStepRead(BaseModel):
    id: str
    name: str
    status: str
    timestamp: str | None = None
    details: str | None = None