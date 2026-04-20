from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.services.ai_learning_service import (
    create_or_update_learning_record,
    deactivate_learning_record,
    list_learning_records,
    suggest_mapping_for_document,
)

router = APIRouter(prefix="/api/ai-learning", tags=["ai-learning"])


@router.post("/learn-layout")
def learn_layout(payload: dict, db: Session = Depends(get_db)):
    row = create_or_update_learning_record(
        db,
        client_id=payload.get("client_id", ""),
        supplier_name=payload.get("supplier_name"),
        raw_text=payload.get("raw_text", ""),
        mapping_profile_name=payload.get("mapping_profile_name", ""),
        item_mapping=payload.get("item_mapping"),
        header_mapping=payload.get("header_mapping"),
        coordinate_mappings=payload.get("coordinate_mappings"),
        created_by=payload.get("created_by"),
    )

    return {
        "status": "SUCCESS",
        "message": "Layout learned successfully.",
        "learning_id": str(row.learning_id),
        "mapping_profile_name": row.mapping_profile_name,
        "fingerprint_hash": row.fingerprint_hash,
    }


@router.post("/suggest-mapping")
def suggest_mapping(payload: dict, db: Session = Depends(get_db)):
    return suggest_mapping_for_document(
        db,
        client_id=payload.get("client_id", ""),
        raw_text=payload.get("raw_text", ""),
        supplier_name=payload.get("supplier_name"),
        min_score=float(payload.get("min_score", 0.45)),
    )


@router.get("/learned-layouts")
def get_learned_layouts(
    client_id: str | None = None,
    supplier_name: str | None = None,
    db: Session = Depends(get_db),
):
    rows = list_learning_records(
        db,
        client_id=client_id,
        supplier_name=supplier_name,
        only_active=True,
    )

    items = []
    for row in rows:
        items.append(
            {
                "learning_id": str(row.learning_id),
                "client_id": row.client_id,
                "supplier_name": row.supplier_name,
                "mapping_profile_name": row.mapping_profile_name,
                "fingerprint_hash": row.fingerprint_hash,
                "layout_fingerprint": row.layout_fingerprint_json or {},
                "learned_mapping": row.learned_mapping_json or {},
                "usage_count": row.usage_count,
                "last_used_at": row.last_used_at,
                "is_active": row.is_active,
                "created_by": row.created_by,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            }
        )

    return {
        "count": len(items),
        "items": items,
    }


@router.post("/deactivate/{learning_id}")
def deactivate_layout(learning_id: str, db: Session = Depends(get_db)):
    return deactivate_learning_record(db, learning_id)