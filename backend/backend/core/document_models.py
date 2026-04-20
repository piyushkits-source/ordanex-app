from typing import List, Optional, Dict, Any
from pydantic import BaseModel


class CanonicalLineItem(BaseModel):
    line_no: Optional[int]
    material: Optional[str]
    description: Optional[str]
    quantity: Optional[float]
    uom: Optional[str]
    unit_price: Optional[float]
    amount: Optional[float]
    delivery_date: Optional[str]


class CanonicalDocument(BaseModel):
    doc_type: str  # PO, ASN, INVOICE etc.
    source_type: str  # PDF, EXCEL, X12 etc.

    header: Dict[str, Any]
    line_items: List[CanonicalLineItem]

    raw_text: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None