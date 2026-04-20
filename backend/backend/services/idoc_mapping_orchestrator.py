from __future__ import annotations

from sqlalchemy.orm import Session

from backend.services.som_builder import build_som
from backend.services.mapping_engine import apply_mapping_profile
from backend.services.rules_engine import apply_rule_engine
from backend.services.profile_selector import load_selected_profile_mapping


def orchestrate_mapping_and_rules(
    db: Session,
    *,
    client_id: str,
    parsed_data: dict,
    date_rules: dict | None = None,
    duplicate_rule: dict | None = None,
    uom_rules=None,
    business_rules=None,
    split_rule: dict | None = None,
):
    # SOM is your canonical base
    som = build_som(parsed_data)

    som.setdefault("header", {})
    som["header"]["client_id"] = client_id

    # keep a snapshot before rules if needed for debugging / monitor download
    canonical_before_rules = _deep_copy_dict(som)

    sold_to = som["header"].get("sold_to")
    ship_to = som["header"].get("ship_to")

    selected = load_selected_profile_mapping(
        db,
        client_id=client_id,
        sold_to=sold_to,
        ship_to=ship_to,
        parsed_data=parsed_data,
    )

    selection = selected["selection"]
    profile = selection["selected_profile"]
    resolved_mapping_json = selected["resolved_mapping_json"]

    mapped_preview_before_rules = (
        apply_mapping_profile(som, resolved_mapping_json, profile.profile_name)
        if profile else None
    )

    pipeline = apply_rule_engine(
        db,
        som,
        date_rules=date_rules,
        duplicate_rule=duplicate_rule,
        uom_rules=uom_rules,
        business_rules=business_rules,
        split_rule=split_rule,
    )

    final_som = pipeline["som"]

    # final canonical after rules/UOM/splits etc.
    canonical_after_rules = _deep_copy_dict(final_som)

    mapped_preview = (
        apply_mapping_profile(final_som, resolved_mapping_json, profile.profile_name)
        if profile else None
    )

    mapped_split_docs = []
    for doc in pipeline["split_docs"]:
        if not doc.get("raw_text"):
            doc["raw_text"] = (
                final_som.get("raw_text")
                or parsed_data.get("raw_text")
                or ""
            )

        mapped = (
            apply_mapping_profile(doc, resolved_mapping_json, profile.profile_name)
            if profile else None
        )

        mapped_split_docs.append(
            {
                "document": doc,
                "mapped_preview": mapped,
            }
        )

    return {
        "selected_profile": profile.profile_name if profile else None,
        "selection_score": selection.get("score"),
        "selection_reasons": selection.get("reasons", []),
        "selection_candidates": selection.get("candidates", []),

        # existing return
        "som": final_som,

        # new canonical fields
        "canonical_before_rules": canonical_before_rules,
        "canonical": canonical_after_rules,

        "mapped_preview_before_rules": mapped_preview_before_rules,
        "mapped_preview": mapped_preview,
        "split_docs": mapped_split_docs,
    }


def _deep_copy_dict(value):
    if isinstance(value, dict):
        return {k: _deep_copy_dict(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_deep_copy_dict(v) for v in value]
    return value