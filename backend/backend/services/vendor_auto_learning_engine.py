from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from typing import Any


def _norm(v: Any) -> str:
    return str(v or "").strip()


def _norm_lower(v: Any) -> str:
    return _norm(v).lower()


def _safe_json(v: Any) -> dict:
    if isinstance(v, dict):
        return v
    if not v:
        return {}
    try:
        return json.loads(v)
    except Exception:
        return {}


def _tokenize(text: str) -> list[str]:
    text = _norm_lower(text)
    text = re.sub(r"[^a-z0-9\s:/._-]", " ", text)
    parts = [p for p in text.split() if len(p) > 1]
    return parts


def _top_lines(raw_text: str, max_lines: int = 30) -> list[str]:
    lines = []
    for line in (raw_text or "").splitlines():
        line = _norm_lower(line)
        if not line:
            continue
        line = re.sub(r"\s+", " ", line)
        if len(line) < 2:
            continue
        lines.append(line)
        if len(lines) >= max_lines:
            break
    return lines


def build_layout_fingerprint(raw_text: str, header_dict: dict | None = None) -> dict:
    """
    Builds a reusable layout signature using top-of-document text + header cues.
    """
    header_dict = header_dict or {}
    lines = _top_lines(raw_text, max_lines=25)

    key_values = {
        "supplier_name": _norm_lower(header_dict.get("supplier_name")),
        "currency": _norm_lower(header_dict.get("currency")),
        "sold_to": _norm_lower(header_dict.get("sold_to")),
        "ship_to": _norm_lower(header_dict.get("ship_to")),
    }

    joined = "\n".join(lines[:12]) + "\n" + json.dumps(key_values, sort_keys=True)
    hash_value = hashlib.sha256(joined.encode("utf-8")).hexdigest()

    token_counts = Counter()
    for line in lines[:15]:
        token_counts.update(_tokenize(line))

    top_tokens = [tok for tok, _ in token_counts.most_common(30)]

    return {
        "fingerprint_hash": hash_value,
        "top_lines": lines[:12],
        "top_tokens": top_tokens,
        "header_cues": key_values,
    }


def _jaccard_similarity(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return len(a.intersection(b)) / max(1, len(a.union(b)))


def score_fingerprint_match(current_fp: dict, learned_fp: dict) -> float:
    current_tokens = set(current_fp.get("top_tokens", []) or [])
    learned_tokens = set((learned_fp or {}).get("top_tokens", []) or [])

    token_score = _jaccard_similarity(current_tokens, learned_tokens)

    current_lines = set(current_fp.get("top_lines", []) or [])
    learned_lines = set((learned_fp or {}).get("top_lines", []) or [])
    line_score = _jaccard_similarity(current_lines, learned_lines)

    current_cues = current_fp.get("header_cues", {}) or {}
    learned_cues = (learned_fp or {}).get("header_cues", {}) or {}

    cue_hits = 0
    cue_total = 0
    for key in {"supplier_name", "currency", "sold_to", "ship_to"}:
        a = _norm_lower(current_cues.get(key))
        b = _norm_lower(learned_cues.get(key))
        if a or b:
            cue_total += 1
            if a and b and a == b:
                cue_hits += 1
    cue_score = (cue_hits / cue_total) if cue_total else 0.0

    # weighted
    return round((token_score * 0.45) + (line_score * 0.35) + (cue_score * 0.20), 4)


def suggest_mapping_profile(
    *,
    current_raw_text: str,
    current_header: dict | None,
    learned_records: list[dict],
    min_score: float = 0.45,
) -> dict:
    """
    Returns the best learned match, if any.
    learned_records rows expected to contain:
      - supplier_name
      - fingerprint_json
      - mapping_profile_id
      - learned_mapping_json
      - usage_count
    """
    current_fp = build_layout_fingerprint(current_raw_text, current_header)
    best: dict | None = None

    for rec in learned_records:
        learned_fp = _safe_json(rec.get("fingerprint_json"))
        score = score_fingerprint_match(current_fp, learned_fp)
        if score < min_score:
            continue

        candidate = {
            "score": score,
            "supplier_name": rec.get("supplier_name"),
            "mapping_profile_id": rec.get("mapping_profile_id"),
            "learned_mapping_json": _safe_json(rec.get("learned_mapping_json")),
            "usage_count": int(rec.get("usage_count") or 0),
            "record_id": rec.get("vendor_learning_id"),
            "fingerprint_hash": learned_fp.get("fingerprint_hash"),
        }

        if best is None:
            best = candidate
            continue

        # prefer higher score, then higher usage
        if candidate["score"] > best["score"]:
            best = candidate
        elif candidate["score"] == best["score"] and candidate["usage_count"] > best["usage_count"]:
            best = candidate

    return {
        "current_fingerprint": current_fp,
        "best_match": best,
        "matched": best is not None,
    }


def build_learning_payload(
    *,
    client_id: str,
    supplier_name: str,
    raw_text: str,
    header_dict: dict | None,
    mapping_profile_id: str | int | None,
    learned_mapping_json: dict | None = None,
    approved_by: str | None = None,
) -> dict:
    fp = build_layout_fingerprint(raw_text, header_dict)
    return {
        "client_id": client_id,
        "supplier_name": _norm(supplier_name),
        "fingerprint_json": fp,
        "mapping_profile_id": mapping_profile_id,
        "learned_mapping_json": learned_mapping_json or {},
        "approved_by": approved_by,
    }
