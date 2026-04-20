from __future__ import annotations

from copy import deepcopy
from typing import Any
from sqlalchemy.orm import Session
from backend.db import models


def _deep_merge(parent: Any, child: Any) -> Any:
    if isinstance(parent, dict) and isinstance(child, dict):
        merged = deepcopy(parent)
        for k, v in child.items():
            if k in merged:
                merged[k] = _deep_merge(merged[k], v)
            else:
                merged[k] = deepcopy(v)
        return merged

    # lists are fully overridden by child
    if child is not None:
        return deepcopy(child)

    return deepcopy(parent)


def _get_profile_candidates(db: Session, client_id: str, sold_to: str | None, ship_to: str | None):
    rows = (
        db.query(models.MappingProfile)
        .filter(models.MappingProfile.is_active == True)
        .order_by(models.MappingProfile.priority.asc(), models.MappingProfile.updated_at.desc())
        .all()
    )

    exact = []
    sold_only = []
    client_default = []
    global_default = []

    sold_val = (sold_to or "").strip()
    ship_val = (ship_to or "").strip()

    for row in rows:
        r_client = (row.client_id or "").strip()
        r_sold_to = (row.sold_to or "").strip()
        r_ship_to = (row.ship_to or "").strip()

        if r_client == client_id and r_sold_to == sold_val and r_ship_to == ship_val and sold_val and ship_val:
            exact.append(row)
        elif r_client == client_id and r_sold_to == sold_val and not r_ship_to and sold_val:
            sold_only.append(row)
        elif r_client == client_id and not r_sold_to and not r_ship_to:
            client_default.append(row)
        elif r_client.upper() == "GLOBAL" and not r_sold_to and not r_ship_to:
            global_default.append(row)

    return exact, sold_only, client_default, global_default


def select_mapping_profile(db: Session, client_id: str, sold_to: str | None, ship_to: str | None):
    exact, sold_only, client_default, global_default = _get_profile_candidates(db, client_id, sold_to, ship_to)
    if exact:
        return exact[0]
    if sold_only:
        return sold_only[0]
    if client_default:
        return client_default[0]
    if global_default:
        return global_default[0]
    return None


def resolve_mapping_profile_json(db: Session, profile_row) -> dict:
    if not profile_row:
        return {}

    visited = set()

    def _resolve(row):
        if not row:
            return {}
        row_id = str(row.mapping_profile_id)
        if row_id in visited:
            raise ValueError(f"Circular mapping profile inheritance detected at {row.profile_name}")
        visited.add(row_id)

        parent_json = {}
        parent_id = getattr(row, "parent_profile_id", None)
        if parent_id:
            parent = (
                db.query(models.MappingProfile)
                .filter(models.MappingProfile.mapping_profile_id == parent_id)
                .first()
            )
            parent_json = _resolve(parent)

        child_json = row.mapping_json or {}
        return _deep_merge(parent_json, child_json)

    return _resolve(profile_row)


def _resolve_source_value(source_expr: str, som_header: dict, item: dict | None = None):
    source_expr = str(source_expr or "").strip()
    item = item or {}

    if not source_expr:
        return None

    if source_expr.startswith("constant:"):
        return source_expr.split("constant:", 1)[1]

    if source_expr.startswith("header."):
        return som_header.get(source_expr.split("header.", 1)[1])

    if source_expr.startswith("item."):
        return item.get(source_expr.split("item.", 1)[1])

    if source_expr in item:
        return item.get(source_expr)

    return som_header.get(source_expr)


def apply_mapping_profile(som: dict, resolved_mapping_json: dict, profile_name: str = "PROFILE") -> dict:
    som_header = dict(som.get("header") or {})
    som_items = list(som.get("items") or [])

    header_mapping = resolved_mapping_json.get("header_mapping") or {}
    item_mapping = resolved_mapping_json.get("item_mapping") or {}

    mapped_header: dict[str, Any] = {}
    for target, source in header_mapping.items():
        mapped_header[target] = _resolve_source_value(source, som_header)

    mapped_items: list[dict[str, Any]] = []
    for item in som_items:
        mapped_item: dict[str, Any] = {}
        for target, source in item_mapping.items():
            mapped_item[target] = _resolve_source_value(source, som_header, item)
        mapped_items.append(mapped_item)

    return {
        "profile_name": profile_name,
        "mapping_json": resolved_mapping_json,
        "header": mapped_header,
        "items": mapped_items,
    }

def map_columns(df: pd.DataFrame, mapping: dict) -> pd.DataFrame:
    result = df.copy()

    for target, aliases in mapping.items():
        for col in df.columns:
            if col.lower().strip() in [a.lower() for a in aliases]:
                result[target] = df[col]
                break

    return result
