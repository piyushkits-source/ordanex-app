from __future__ import annotations

from typing import Any

from backend.services.row_classification_service import classify_candidate_rows


def _norm(v: Any) -> str:
    return str(v or "").strip()


def _norm_upper(v: Any) -> str:
    return _norm(v).upper()


def _to_float(v: Any) -> float:
    try:
        return float(v or 0)
    except Exception:
        try:
            return float(str(v).replace(",", "").strip() or 0)
        except Exception:
            return 0.0


def _safe_int(v: Any, default: int) -> int:
    try:
        return int(v)
    except Exception:
        return default


def _sort_line_no(value: Any):
    s = _norm(value)
    if not s:
        return (1, 999999)
    try:
        return (0, int(s))
    except Exception:
        return (0, s)


def get_item_processing_config(config: dict | None = None) -> dict:
    config = config or {}
    return {
        "grouping_mode": config.get("grouping_mode", "NO_GROUPING"),
        "group_if_delivery_date_same": bool(config.get("group_if_delivery_date_same", False)),
        "keep_separate_if_delivery_date_diff": bool(config.get("keep_separate_if_delivery_date_diff", True)),
        "po_item_number_strategy": config.get("po_item_number_strategy", "SOURCE_LINE_NO"),
        "default_step": _safe_int(config.get("default_step", 10), 10),
        "pad_length": _safe_int(config.get("pad_length", 0), 0),
        "description_merge_mode": config.get("description_merge_mode", "KEEP_LONGEST_DESCRIPTION"),
        "merge_continuation_lines": bool(config.get("merge_continuation_lines", True)),
        "drop_metadata_lines": bool(config.get("drop_metadata_lines", True)),
    }


def merge_descriptions(existing: str, incoming: str, mode: str = "KEEP_LONGEST_DESCRIPTION") -> str:
    existing = _norm(existing)
    incoming = _norm(incoming)

    if not existing:
        return incoming
    if not incoming:
        return existing

    if mode == "CONCAT_DESCRIPTIONS":
        if incoming.lower() in existing.lower():
            return existing
        return f"{existing} {incoming}".strip()

    if mode == "PREFER_FIRST_NON_EMPTY":
        return existing

    return incoming if len(incoming) > len(existing) else existing


def build_group_key(item: dict, cfg: dict) -> tuple:
    material = _norm_upper(item.get("material") or item.get("material_code"))
    qty = round(_to_float(item.get("quantity")), 3)
    price = round(_to_float(item.get("unit_price")), 4)
    amount = round(_to_float(item.get("amount")), 2)
    delivery_date = _norm(item.get("delivery_date"))
    uom = _norm_upper(item.get("uom"))
    line_no = _norm(item.get("line_no"))

    grouping_mode = cfg.get("grouping_mode", "NO_GROUPING")
    group_if_delivery_date_same = cfg.get("group_if_delivery_date_same", False)
    keep_separate_if_delivery_date_diff = cfg.get("keep_separate_if_delivery_date_diff", True)

    if grouping_mode == "NO_GROUPING":
        return ("NO_GROUPING", line_no or id(item))

    if grouping_mode == "GROUP_BY_MATERIAL":
        if keep_separate_if_delivery_date_diff:
            return ("GROUP_BY_MATERIAL", material, delivery_date)
        return ("GROUP_BY_MATERIAL", material)

    if grouping_mode == "GROUP_BY_MATERIAL_AND_DELIVERY_DATE":
        if not group_if_delivery_date_same:
            return ("NO_GROUPING", line_no or id(item))
        return ("GROUP_BY_MATERIAL_AND_DELIVERY_DATE", material, delivery_date)

    if grouping_mode == "GROUP_BY_MATERIAL_QTY_PRICE":
        if keep_separate_if_delivery_date_diff:
            return ("GROUP_BY_MATERIAL_QTY_PRICE", material, qty, price, delivery_date)
        return ("GROUP_BY_MATERIAL_QTY_PRICE", material, qty, price)

    if grouping_mode == "GROUP_BY_EXACT_COMMERCIALS":
        return ("GROUP_BY_EXACT_COMMERCIALS", material, qty, price, amount, delivery_date, uom)

    return ("NO_GROUPING", line_no or id(item))


def preprocess_items(items: list[dict], config: dict | None = None) -> list[dict]:
    cfg = get_item_processing_config(config)
    classified = classify_candidate_rows(items or [], cfg)

    processed = []
    pending_prev = None

    for idx, item in enumerate(classified, start=1):
        row = dict(item)
        row["line_no"] = row.get("line_no") or idx

        cls = row.get("row_classification", "UNKNOWN")

        if cls == "METADATA_LINE" and cfg.get("drop_metadata_lines", True):
            continue

        if cls == "CONTINUATION_LINE" and cfg.get("merge_continuation_lines", True):
            if pending_prev:
                pending_prev["description"] = merge_descriptions(
                    pending_prev.get("description"),
                    row.get("description"),
                    cfg.get("description_merge_mode", "KEEP_LONGEST_DESCRIPTION"),
                )
                if not _norm(pending_prev.get("delivery_date")) and _norm(row.get("delivery_date")):
                    pending_prev["delivery_date"] = row.get("delivery_date")
            continue

        processed.append(row)
        pending_prev = row

    processed.sort(key=lambda x: _sort_line_no(x.get("line_no")))
    return processed


def group_items(items: list[dict], config: dict | None = None) -> list[dict]:
    cfg = get_item_processing_config(config)
    items = preprocess_items(items or [], cfg)

    if not items:
        return []

    if cfg["grouping_mode"] == "NO_GROUPING":
        out = []
        for idx, item in enumerate(items, start=1):
            row = dict(item)
            row["line_no"] = item.get("line_no") or idx
            out.append(row)
        out.sort(key=lambda x: _sort_line_no(x.get("line_no")))
        return out

    grouped: dict[tuple, dict] = {}

    for idx, item in enumerate(items, start=1):
        row = dict(item)
        row["line_no"] = row.get("line_no") or idx
        key = build_group_key(row, cfg)

        if key not in grouped:
            grouped[key] = dict(row)
            continue

        existing = grouped[key]
        existing["quantity"] = _to_float(existing.get("quantity")) + _to_float(row.get("quantity"))

        if _to_float(existing.get("amount")) > 0 or _to_float(row.get("amount")) > 0:
            existing["amount"] = round(_to_float(existing.get("amount")) + _to_float(row.get("amount")), 2)

        existing["description"] = merge_descriptions(
            existing.get("description"),
            row.get("description"),
            cfg.get("description_merge_mode", "KEEP_LONGEST_DESCRIPTION"),
        )

        if not _norm(existing.get("delivery_date")) and _norm(row.get("delivery_date")):
            existing["delivery_date"] = row.get("delivery_date")

        if not _norm(existing.get("material")) and _norm(row.get("material")):
            existing["material"] = row.get("material")
            existing["material_code"] = row.get("material_code") or row.get("material")

        if not _norm(existing.get("uom")) and _norm(row.get("uom")):
            existing["uom"] = row.get("uom")

        try:
            existing_line = int(str(existing.get("line_no")).strip())
            incoming_line = int(str(row.get("line_no")).strip())
            existing["line_no"] = min(existing_line, incoming_line)
        except Exception:
            pass

    result = list(grouped.values())
    result.sort(key=lambda x: _sort_line_no(x.get("line_no")))
    return result


def build_posex(item: dict, idx: int, config: dict | None = None) -> str:
    cfg = get_item_processing_config(config)
    strategy = cfg.get("po_item_number_strategy", "SOURCE_LINE_NO")
    step = int(cfg.get("default_step", 10))
    pad_length = int(cfg.get("pad_length", 0))

    if strategy == "SOURCE_LINE_NO":
        raw = item.get("line_no")
        raw_str = _norm(raw)

        if raw_str:
            if raw_str.isdigit():
                return raw_str.zfill(pad_length) if pad_length > 0 else raw_str
            try:
                val = int(raw_str)
            except Exception:
                val = idx * step
        else:
            val = idx * step

    elif strategy == "SEQUENTIAL_1":
        val = idx
    elif strategy == "SEQUENTIAL_10":
        val = idx * step
    elif strategy == "SEQUENTIAL_000010":
        val = idx * step
        return str(val).zfill(max(6, pad_length or 6))
    else:
        val = idx * step

    if pad_length > 0:
        return str(val).zfill(pad_length)
    return str(val)
