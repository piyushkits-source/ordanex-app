from __future__ import annotations

import hashlib
import re
from collections import Counter
from typing import Any


def safe_str(v: Any) -> str:
    return "" if v is None else str(v).strip()


def normalize_text_for_fingerprint(text: str) -> str:
    text = safe_str(text).lower()
    text = re.sub(r"\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b", "<date>", text)
    text = re.sub(r"\b\d+\.\d+\b", "<float>", text)
    text = re.sub(r"\b\d+\b", "<num>", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def top_lines(text: str, max_lines: int = 40) -> list[str]:
    lines = [safe_str(x) for x in (text or "").splitlines()]
    lines = [x for x in lines if x]
    return lines[:max_lines]


def build_layout_fingerprint(raw_text: str, supplier_name: str | None = None) -> dict[str, Any]:
    normalized = normalize_text_for_fingerprint(raw_text)
    header_lines = top_lines(normalized, 40)
    joined = "\n".join(header_lines)
    fingerprint_hash = hashlib.sha256(joined.encode("utf-8")).hexdigest()

    anchor_tokens: list[str] = []
    for line in header_lines[:15]:
        tokens = [t for t in re.split(r"[^a-z0-9]+", line) if len(t) > 2]
        anchor_tokens.extend(tokens)

    common_tokens = [token for token, _ in Counter(anchor_tokens).most_common(25)]

    return {
        "supplier_name": safe_str(supplier_name),
        "fingerprint_hash": fingerprint_hash,
        "header_lines": header_lines,
        "anchor_tokens": common_tokens,
        "normalized_header_block": joined,
    }


def score_layout_similarity(current_fp: dict[str, Any], learned_fp: dict[str, Any]) -> float:
    current_tokens = set(current_fp.get("anchor_tokens", []))
    learned_tokens = set(learned_fp.get("anchor_tokens", []))

    if not current_tokens and not learned_tokens:
        return 0.0

    intersection = len(current_tokens & learned_tokens)
    union = len(current_tokens | learned_tokens) or 1
    token_score = intersection / union

    hash_score = 1.0 if current_fp.get("fingerprint_hash") == learned_fp.get("fingerprint_hash") else 0.0

    return round((token_score * 0.7) + (hash_score * 0.3), 4)


def build_vendor_learning_payload(
    *,
    client_id: str,
    supplier_name: str | None,
    raw_text: str,
    mapping_profile_name: str | None,
    item_mapping: dict | None = None,
    header_mapping: dict | None = None,
    coordinate_mappings: list[dict] | None = None,
) -> dict[str, Any]:
    fp = build_layout_fingerprint(raw_text=raw_text, supplier_name=supplier_name)

    return {
        "client_id": client_id,
        "supplier_name": safe_str(supplier_name),
        "mapping_profile_name": safe_str(mapping_profile_name),
        "layout_fingerprint": fp,
        "learned_mapping": {
            "item_mapping": item_mapping or {},
            "header_mapping": header_mapping or {},
            "coordinate_mappings": coordinate_mappings or [],
        },
    }


def suggest_mapping_from_learning(
    *,
    current_raw_text: str,
    current_supplier_name: str | None,
    learned_profiles: list[dict[str, Any]],
    min_score: float = 0.45,
) -> dict[str, Any]:
    current_fp = build_layout_fingerprint(
        raw_text=current_raw_text,
        supplier_name=current_supplier_name,
    )

    candidates: list[dict[str, Any]] = []

    for profile in learned_profiles or []:
        learned_fp = (profile or {}).get("layout_fingerprint", {}) or {}
        score = score_layout_similarity(current_fp, learned_fp)

        supplier_bonus = (
            0.15
            if safe_str(profile.get("supplier_name")).lower() == safe_str(current_supplier_name).lower()
            and safe_str(current_supplier_name)
            else 0.0
        )

        final_score = round(min(score + supplier_bonus, 1.0), 4)

        candidates.append(
            {
                "learning_id": profile.get("learning_id"),
                "mapping_profile_name": profile.get("mapping_profile_name"),
                "supplier_name": profile.get("supplier_name"),
                "score": final_score,
                "item_mapping": ((profile.get("learned_mapping") or {}).get("item_mapping") or {}),
                "header_mapping": ((profile.get("learned_mapping") or {}).get("header_mapping") or {}),
                "coordinate_mappings": ((profile.get("learned_mapping") or {}).get("coordinate_mappings") or []),
            }
        )

    candidates = sorted(candidates, key=lambda x: x["score"], reverse=True)

    best = candidates[0] if candidates else None
    if not best or best["score"] < min_score:
        return {
            "matched": False,
            "best_score": best["score"] if best else 0.0,
            "suggested_profile": None,
            "candidates": candidates[:5],
            "message": "No strong learned layout match found.",
        }

    return {
        "matched": True,
        "best_score": best["score"],
        "suggested_profile": best["mapping_profile_name"],
        "suggested_item_mapping": best["item_mapping"],
        "suggested_header_mapping": best["header_mapping"],
        "suggested_coordinate_mappings": best["coordinate_mappings"],
        "matched_learning_id": best.get("learning_id"),
        "candidates": candidates[:5],
        "message": "Learned layout match found.",
    }