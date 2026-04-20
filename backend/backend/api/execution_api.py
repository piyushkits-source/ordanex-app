from __future__ import annotations

from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.services.execution_pipeline import execute_order_pipeline


router = APIRouter(prefix="/execution", tags=["Execution"])


class ExecuteOrderRequest(BaseModel):
    client_id: str
    partner_id: str
    document_type: str = "PO"
    input_format: str = "PDF"
    source_payload: dict


@router.post("/run")
def run_execution(payload: ExecuteOrderRequest, db: Session = Depends(get_db)):
    return execute_order_pipeline(
        db=db,
        client_id=payload.client_id,
        partner_id=payload.partner_id,
        source_payload=payload.source_payload,
        document_type=payload.document_type,
        input_format=payload.input_format,
    )