from __future__ import annotations

from typing import Any
from sqlalchemy.orm import Session

from backend.db import models
from backend.services.mapping_engine import resolve_mapping_profile_json


def _norm(value: Any) -> str:
    return str(value or "").strip().upper()


def _layout_signature_from_context(
    parsed_data: dict | None = None,
    po: Any | None = None,
) -> str:
    if parsed_data:
        meta = parsed_data.get("parser_meta", {}) or {}
        header = parsed_data.get("header", {}) or {}
        return _norm(meta.get("layout_signature") or header.get("layout_signature"))
    if po:
        return _norm(getattr(po, "layout_signature", None))
    return ""


def _vendor_from_context(
    parsed_data: dict | None = None,
    po: Any | None = None,
) -> str:
    if parsed_data:
        header = parsed_data.get("header", {}) or {}
        return _norm(header.get("supplier") or header.get("vendor"))
    if po:
        return _norm(getattr(po, "supplier_name", None))
    return ""


def _field_columns_from_context(
    parsed_data: dict | None = None,
) -> dict:
    if not parsed_data:
        return {}
    meta = parsed_data.get("parser_meta", {}) or {}
    return meta.get("field_columns", {}) or {}


def _score_profile(
    profile,
    *,
    client_id: str,
    sold_to: str,
    ship_to: str,
    vendor: str,
    layout_signature: str,
    field_columns: dict,
) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []

    profile_client = _norm(getattr(profile, "client_id", None))
    profile_sold_to = _norm(getattr(profile, "sold_to", None))
    profile_ship_to = _norm(getattr(profile, "ship_to", None))
    mapping_json = getattr(profile, "mapping_json", {}) or {}

    if profile_client != _norm(client_id) and profile_client != "GLOBAL":
        return (-9999, ["client mismatch"])

    if profile_client == _norm(client_id):
        score += 200
        reasons.append("client match")
    elif profile_client == "GLOBAL":
        score += 20
        reasons.append("global fallback")

    if sold_to and profile_sold_to and sold_to == profile_sold_to:
        score += 120
        reasons.append("sold_to exact")
    elif sold_to and not profile_sold_to:
        score += 10
        reasons.append("sold_to wildcard")

    if ship_to and profile_ship_to and ship_to == profile_ship_to:
        score += 140
        reasons.append("ship_to exact")
    elif ship_to and not profile_ship_to:
        score += 10
        reasons.append("ship_to wildcard")

    if not sold_to and not profile_sold_to:
        score += 5
    if not ship_to and not profile_ship_to:
        score += 5

    xml_profile = mapping_json.get("xml_profile", {}) or {}
    profile_layout_signature = _norm(
        mapping_json.get("layout_signature")
        or xml_profile.get("layout_signature")
    )
    if layout_signature and profile_layout_signature:
        if layout_signature == profile_layout_signature:
            score += 180
            reasons.append("layout signature exact")

    profile_vendor = _norm(
        mapping_json.get("vendor")
        or xml_profile.get("vendor")
        or mapping_json.get("supplier")
    )
    if vendor and profile_vendor:
        if vendor == profile_vendor:
            score += 80
            reasons.append("vendor exact")

    # Light field-column similarity scoring
    profile_field_columns = mapping_json.get("field_columns", {}) or {}
    if field_columns and profile_field_columns:
        common_fields = set(field_columns.keys()) & set(profile_field_columns.keys())
        if common_fields:
            near = 0
            for field in common_fields:
                src = field_columns.get(field, {}) or {}
                tgt = profile_field_columns.get(field, {}) or {}
                src_mid = float(src.get("x_mid", 0) or 0)
                tgt_mid = float(tgt.get("x_mid", 0) or 0)
                if abs(src_mid - tgt_mid) <= 30:
                    near += 1
            score += near * 8
            reasons.append(f"field_columns near={near}")

    # Priority influence
    priority = int(getattr(profile, "priority", 100) or 100)
    score += max(0, 50 - min(priority, 50))
    reasons.append(f"priority={priority}")

    return score, reasons


def select_best_mapping_profile(
    db: Session,
    *,
    client_id: str,
    sold_to: str | None = None,
    ship_to: str | None = None,
    parsed_data: dict | None = None,
    po: Any | None = None,
) -> dict:
    sold_to_n = _norm(sold_to or (parsed_data or {}).get("header", {}).get("sold_to") or getattr(po, "sold_to", None))
    ship_to_n = _norm(ship_to or (parsed_data or {}).get("header", {}).get("ship_to") or getattr(po, "ship_to", None))
    vendor_n = _vendor_from_context(parsed_data=parsed_data, po=po)
    layout_signature_n = _layout_signature_from_context(parsed_data=parsed_data, po=po)
    field_columns = _field_columns_from_context(parsed_data=parsed_data)

    rows = (
        db.query(models.MappingProfile)
        .filter(models.MappingProfile.is_active == True)
        .filter(models.MappingProfile.client_id.in_([client_id, "GLOBAL"]))
        .all()
    )

    ranked = []
    for row in rows:
        score, reasons = _score_profile(
            row,
            client_id=client_id,
            sold_to=sold_to_n,
            ship_to=ship_to_n,
            vendor=vendor_n,
            layout_signature=layout_signature_n,
            field_columns=field_columns,
        )
        if score > -9999:
            ranked.append(
                {
                    "profile": row,
                    "score": score,
                    "reasons": reasons,
                }
            )

    ranked.sort(
        key=lambda x: (
            -x["score"],
            int(getattr(x["profile"], "priority", 100) or 100),
            -int(bool(getattr(x["profile"], "sold_to", None))),
            -int(bool(getattr(x["profile"], "ship_to", None))),
        )
    )

    best = ranked[0] if ranked else None
    return {
        "selected_profile": best["profile"] if best else None,
        "score": best["score"] if best else None,
        "reasons": best["reasons"] if best else [],
        "candidates": [
            {
                "profile_name": r["profile"].profile_name,
                "client_id": r["profile"].client_id,
                "sold_to": r["profile"].sold_to,
                "ship_to": r["profile"].ship_to,
                "priority": r["profile"].priority,
                "score": r["score"],
                "reasons": r["reasons"],
            }
            for r in ranked[:10]
        ],
    }


def load_selected_profile_mapping(
    db: Session,
    *,
    client_id: str,
    sold_to: str | None = None,
    ship_to: str | None = None,
    parsed_data: dict | None = None,
    po: Any | None = None,
) -> dict:
    selection = select_best_mapping_profile(
        db,
        client_id=client_id,
        sold_to=sold_to,
        ship_to=ship_to,
        parsed_data=parsed_data,
        po=po,
    )
    profile = selection["selected_profile"]
    if not profile:
        return {
            "selection": selection,
            "resolved_mapping_json": {},
        }

    resolved = resolve_mapping_profile_json(db, profile)
    return {
        "selection": selection,
        "resolved_mapping_json": resolved,
    }