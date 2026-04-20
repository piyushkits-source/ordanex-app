from __future__ import annotations

from typing import Any


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


def get_row_processing_config(config: dict | None = None) -> dict:
    config = config or {}
    return {
        "merge_continuation_lines": bool(config.get("merge_continuation_lines", True)),
        "min_commercial_score": int(config.get("min_commercial_score", 2)),
        "prefer_source_line_no": bool(config.get("prefer_source_line_no", True)),
    }


def classify_candidate_row(item: dict, config: dict | None = None) -> dict:
    cfg = get_row_processing_config(config)

    material = _norm_upper(item.get("material") or item.get("material_code"))
    line_no = _norm(item.get("line_no"))
    qty = _to_float(item.get("quantity"))
    price = _to_float(item.get("unit_price"))
    amount = _to_float(item.get("amount"))
    desc = _norm(item.get("description"))
    delivery_date = _norm(item.get("delivery_date"))
    uom = _norm_upper(item.get("uom"))

    commercial_score = 0
    if material:
        commercial_score += 1
    if qty > 0:
        commercial_score += 1
    if price > 0:
        commercial_score += 1
    if amount > 0:
        commercial_score += 1
    if line_no:
        commercial_score += 1
    if delivery_date:
        commercial_score += 1
    if uom:
        commercial_score += 1

    classification = "UNKNOWN"
    confidence = "LOW"

    if (material and qty > 0 and (price > 0 or amount > 0)) or (line_no and qty > 0 and (price > 0 or amount > 0)):
        classification = "COMMERCIAL_LINE"
        confidence = "HIGH"
    elif delivery_date and qty > 0:
        classification = "SCHEDULE_LINE"
        confidence = "MEDIUM"
    elif desc and commercial_score < cfg["min_commercial_score"]:
        classification = "CONTINUATION_LINE"
        confidence = "MEDIUM"
    elif not desc and commercial_score == 0:
        classification = "METADATA_LINE"
        confidence = "HIGH"

    result = dict(item)
    result["row_classification"] = classification
    result["row_confidence"] = confidence
    result["commercial_score"] = commercial_score
    return result


def classify_candidate_rows(items: list[dict], config: dict | None = None) -> list[dict]:
    return [classify_candidate_row(item, config) for item in (items or [])]
