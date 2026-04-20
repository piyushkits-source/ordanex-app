
from __future__ import annotations

from collections import defaultdict


def build_split_po_number(original_po_number: str, idx: int, split_rule: dict | None) -> str:
    split_rule = split_rule or {}
    strategy = split_rule.get("po_number_strategy", "same")

    if strategy == "same":
        return original_po_number
    if strategy == "suffix":
        sep = split_rule.get("suffix_separator", "-")
        start = int(split_rule.get("suffix_start", 1))
        return f"{original_po_number}{sep}{idx + start}"
    if strategy == "custom_pattern":
        pattern = split_rule.get("pattern", "{po_number}-{n}")
        return pattern.format(po_number=original_po_number, n=idx + 1)

    return original_po_number


def split_items(items: list[dict], split_rule: dict | None) -> list[dict]:
    split_rule = split_rule or {"mode": "none"}
    mode = split_rule.get("mode", "none")

    if not items:
        return [{"split_key": "EMPTY", "items": []}]
    if mode == "none":
        return [{"split_key": "ALL", "items": items}]
    if mode == "each_line":
        return [{"split_key": f"LINE_{idx+1}", "items": [item]} for idx, item in enumerate(items)]
    if mode == "by_delivery_date":
        grouped = defaultdict(list)
        for item in items:
            grouped[str(item.get("delivery_date") or "NO_DATE")].append(item)
        return [{"split_key": k, "items": v} for k, v in grouped.items()]
    if mode == "by_material":
        grouped = defaultdict(list)
        for item in items:
            grouped[str(item.get("material_code") or item.get("material") or "NO_MATERIAL")].append(item)
        return [{"split_key": k, "items": v} for k, v in grouped.items()]
    if mode == "by_ship_to":
        grouped = defaultdict(list)
        for item in items:
            grouped[str(item.get("ship_to") or "NO_SHIP_TO")].append(item)
        return [{"split_key": k, "items": v} for k, v in grouped.items()]
    if mode == "custom_group_by":
        fields = split_rule.get("group_by_fields", [])
        grouped = defaultdict(list)
        for item in items:
            key = "|".join(str(item.get(f) or "") for f in fields) or "DEFAULT"
            grouped[key].append(item)
        return [{"split_key": k, "items": v} for k, v in grouped.items()]

    return [{"split_key": "ALL", "items": items}]
