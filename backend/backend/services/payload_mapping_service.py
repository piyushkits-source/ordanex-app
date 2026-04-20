from __future__ import annotations


def _extract_value(source: dict, source_path: str):
    parts = source_path.split(".")
    current = source
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def apply_mapping_profile(working_payload: dict, mapping_profile) -> dict:
    if not mapping_profile:
        return working_payload

    header_mapping = mapping_profile.header_mapping_json or {}
    line_mapping = mapping_profile.line_mapping_json or {}

    mapped_header = {}
    for target_field, source_path in header_mapping.items():
        mapped_header[target_field] = _extract_value(working_payload, str(source_path))

    mapped_items = []
    for item in working_payload.get("items", []):
        source_item = {"item": item}
        mapped_item = {}
        for target_field, source_path in line_mapping.items():
            mapped_item[target_field] = _extract_value(source_item, str(source_path))
        mapped_items.append(mapped_item)

    return {
        "header": mapped_header,
        "items": mapped_items,
        "meta": {
            "document_type": working_payload.get("document_type"),
            "input_format": working_payload.get("input_format"),
        },
    }