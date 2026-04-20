from __future__ import annotations
from typing import Any, Optional
from pydantic import BaseModel, Field

class Party(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None

class LineItem(BaseModel):
    line_no: int
    material_code: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[float] = None
    uom: Optional[str] = None
    unit_price: Optional[float] = None
    amount: Optional[float] = None
    delivery_date: Optional[str] = None
    ship_to_code: Optional[str] = None
    location: Optional[str] = None
    extra: dict[str, Any] = Field(default_factory=dict)

class CanonicalDocument(BaseModel):
    document_type: str = "UNKNOWN"
    message_type: str = "UNKNOWN"
    format_type: str = "UNKNOWN"
    document_number: Optional[str] = None
    document_date: Optional[str] = None
    received_date: Optional[str] = None
    currency_code: Optional[str] = None
    language_code: Optional[str] = None
    buyer: Optional[Party] = None
    supplier: Optional[Party] = None
    ship_to: Optional[Party] = None
    bill_to: Optional[Party] = None
    header_fields: dict[str, Any] = Field(default_factory=dict)
    line_items: list[LineItem] = Field(default_factory=list)
    references: dict[str, Any] = Field(default_factory=dict)
    totals: dict[str, Any] = Field(default_factory=dict)
    source_metadata: dict[str, Any] = Field(default_factory=dict)
    raw_payload: dict[str, Any] = Field(default_factory=dict)
    extraction_evidence: dict[str, Any] = Field(default_factory=dict)
