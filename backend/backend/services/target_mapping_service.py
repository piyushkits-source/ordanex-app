from __future__ import annotations

from typing import Any


def _extract_value(source: Any, source_path: str):
    current = source
    for part in str(source_path or "").split("."):
        if not part:
            continue
        if isinstance(current, dict):
            current = current.get(part)
            continue
        if isinstance(current, list) and part.isdigit():
            idx = int(part)
            if 0 <= idx < len(current):
                current = current[idx]
                continue
        return None
    return current


def _mapping_profile_from_flow(flow) -> Any | None:
    if flow is None:
        return None
    if isinstance(flow, dict):
        return flow.get("target_mapping_profile") or flow.get("mapping_profile")
    return getattr(flow, "target_mapping_profile", None) or getattr(flow, "mapping_profile", None)


def resolve_target_profile(mapping_profile=None, flow=None) -> dict[str, Any]:
    profile = mapping_profile or _mapping_profile_from_flow(flow)
    if profile is None:
        return {}

    layout_hint = getattr(profile, "layout_hint_json", None) or {}
    if not isinstance(layout_hint, dict):
        return {}

    target_profile = layout_hint.get("target_profile") or {}
    return dict(target_profile) if isinstance(target_profile, dict) else {}


def resolve_header_target_value(
    canonical: dict[str, Any],
    *,
    mapping_profile=None,
    target_field: str,
    default: Any = None,
):
    profile = mapping_profile or _mapping_profile_from_flow(None)
    if profile is None:
        return default

    mapping_json = getattr(profile, "field_mapping_json", None) or {}
    defaults_json = getattr(profile, "header_defaults_json", None) or {}

    source_path = mapping_json.get(target_field)
    if source_path:
        mapped = _extract_value(canonical, str(source_path))
        if mapped not in (None, ""):
            return mapped

    if target_field in defaults_json and defaults_json.get(target_field) not in (None, ""):
        return defaults_json.get(target_field)

    return default


def resolve_line_target_value(
    canonical: dict[str, Any],
    item: dict[str, Any],
    *,
    mapping_profile=None,
    target_field: str,
    default: Any = None,
):
    profile = mapping_profile or _mapping_profile_from_flow(None)
    if profile is None:
        return default

    mapping_json = getattr(profile, "line_mapping_json", None) or {}
    source_path = mapping_json.get(target_field)
    if not source_path:
        return default

    source_root = {
        "canonical": canonical,
        "header": canonical.get("header", {}),
        "parties": canonical.get("parties", {}),
        "item": item,
    }
    mapped = _extract_value(source_root, str(source_path))
    return default if mapped in (None, "") else mapped


def mapping_profile_from_flow(flow):
    return _mapping_profile_from_flow(flow)
