from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from backend.db import models
from backend.services.ai_learning_engine import (
    build_vendor_learning_payload,
    suggest_mapping_from_learning,
)


def _extract_fingerprint_hash(layout_fingerprint_json: dict[str, Any]) -> str:
    return str((layout_fingerprint_json or {}).get("fingerprint_hash") or "").strip()


def create_or_update_learning_record(
    db: Session,
    *,
    client_id: str,
    supplier_name: str | None,
    raw_text: str,
    mapping_profile_name: str,
    item_mapping: dict | None = None,
    header_mapping: dict | None = None,
    coordinate_mappings: list[dict] | None = None,
    created_by: str | None = None,
) -> models.VendorLayoutLearning:
    payload = build_vendor_learning_payload(
        client_id=client_id,
        supplier_name=supplier_name,
        raw_text=raw_text,
        mapping_profile_name=mapping_profile_name,
        item_mapping=item_mapping,
        header_mapping=header_mapping,
        coordinate_mappings=coordinate_mappings,
    )

    layout_fingerprint = payload["layout_fingerprint"]
    learned_mapping = payload["learned_mapping"]
    fingerprint_hash = _extract_fingerprint_hash(layout_fingerprint)

    existing = (
        db.query(models.VendorLayoutLearning)
        .filter(models.VendorLayoutLearning.client_id == client_id)
        .filter(models.VendorLayoutLearning.supplier_name == (supplier_name or ""))
        .filter(models.VendorLayoutLearning.mapping_profile_name == mapping_profile_name)
        .filter(models.VendorLayoutLearning.fingerprint_hash == fingerprint_hash)
        .first()
    )

    if existing:
        existing.layout_fingerprint_json = layout_fingerprint
        existing.learned_mapping_json = learned_mapping
        existing.updated_at = datetime.utcnow()
        if created_by:
            existing.created_by = created_by
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing

    row = models.VendorLayoutLearning(
        client_id=client_id,
        supplier_name=supplier_name or "",
        mapping_profile_name=mapping_profile_name,
        fingerprint_hash=fingerprint_hash,
        layout_fingerprint_json=layout_fingerprint,
        learned_mapping_json=learned_mapping,
        usage_count=0,
        last_used_at=None,
        is_active=True,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_learning_records(
    db: Session,
    *,
    client_id: str | None = None,
    supplier_name: str | None = None,
    only_active: bool = True,
) -> list[models.VendorLayoutLearning]:
    q = db.query(models.VendorLayoutLearning)

    if client_id:
        q = q.filter(models.VendorLayoutLearning.client_id == client_id)
    if supplier_name is not None:
        q = q.filter(models.VendorLayoutLearning.supplier_name == supplier_name)
    if only_active:
        q = q.filter(models.VendorLayoutLearning.is_active == True)

    return q.order_by(models.VendorLayoutLearning.updated_at.desc()).all()


def suggest_mapping_for_document(
    db: Session,
    *,
    client_id: str,
    raw_text: str,
    supplier_name: str | None,
    min_score: float = 0.45,
) -> dict[str, Any]:
    rows = list_learning_records(db, client_id=client_id, only_active=True)

    learned_profiles: list[dict[str, Any]] = []
    for row in rows:
        learned_profiles.append(
            {
                "learning_id": str(row.learning_id),
                "supplier_name": row.supplier_name,
                "mapping_profile_name": row.mapping_profile_name,
                "layout_fingerprint": row.layout_fingerprint_json or {},
                "learned_mapping": row.learned_mapping_json or {},
            }
        )

    result = suggest_mapping_from_learning(
        current_raw_text=raw_text,
        current_supplier_name=supplier_name,
        learned_profiles=learned_profiles,
        min_score=min_score,
    )

    matched_learning_id = result.get("matched_learning_id")
    if matched_learning_id:
        matched_row = (
            db.query(models.VendorLayoutLearning)
            .filter(models.VendorLayoutLearning.learning_id == matched_learning_id)
            .first()
        )
        if matched_row:
            matched_row.usage_count = int(matched_row.usage_count or 0) + 1
            matched_row.last_used_at = datetime.utcnow()
            db.add(matched_row)
            db.commit()

    return result


def deactivate_learning_record(db: Session, learning_id: str) -> dict[str, Any]:
    row = (
        db.query(models.VendorLayoutLearning)
        .filter(models.VendorLayoutLearning.learning_id == learning_id)
        .first()
    )
    if not row:
        return {"status": "NOT_FOUND", "message": "Learning record not found."}

    row.is_active = False
    row.updated_at = datetime.utcnow()
    db.add(row)
    db.commit()

    return {"status": "SUCCESS", "message": "Learning record deactivated."}