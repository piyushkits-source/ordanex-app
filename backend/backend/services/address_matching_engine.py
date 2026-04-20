from __future__ import annotations

import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any


def _clean(text: str | None) -> str:
    if not text:
        return ""
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _token_set(text: str) -> set[str]:
    return {t for t in _clean(text).split(" ") if t}


def _ratio(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, _clean(a), _clean(b)).ratio()


@dataclass
class AddressCandidate:
    address_id: str
    score: float
    reason: str
    payload: dict[str, Any]


def build_address_text(row: Any) -> str:
    parts = [
        getattr(row, "address_name", None),
        getattr(row, "address_line1", None),
        getattr(row, "address_line2", None),
        getattr(row, "city", None),
        getattr(row, "state", None),
        getattr(row, "postal_code", None),
        getattr(row, "country", None),
    ]
    return " ".join([str(p).strip() for p in parts if p])


def score_address_match(source_text: str, db_row: Any) -> tuple[float, str]:
    target_text = build_address_text(db_row)

    source_clean = _clean(source_text)
    target_clean = _clean(target_text)

    if not source_clean or not target_clean:
        return 0.0, "missing address text"

    seq_score = _ratio(source_clean, target_clean)

    source_tokens = _token_set(source_clean)
    target_tokens = _token_set(target_clean)

    overlap = 0.0
    if source_tokens and target_tokens:
        overlap = len(source_tokens & target_tokens) / max(len(source_tokens), 1)

    postal_bonus = 0.0
    source_postal = re.findall(r"\b\d{4,10}\b", source_clean)
    target_postal = re.findall(r"\b\d{4,10}\b", target_clean)
    if source_postal and target_postal and set(source_postal) & set(target_postal):
        postal_bonus = 0.15

    country_bonus = 0.0
    source_country = getattr(db_row, "country", None)
    if source_country and _clean(str(source_country)) in source_clean:
        country_bonus = 0.05

    score = (seq_score * 0.65) + (overlap * 0.20) + postal_bonus + country_bonus
    score = min(score, 1.0)

    if postal_bonus > 0:
        reason = "matched address text and postal code"
    elif overlap > 0.5:
        reason = "matched address text and token overlap"
    else:
        reason = "matched address text"

    return round(score, 4), reason


def rank_address_candidates(source_text: str, rows: list[Any], limit: int = 5) -> list[AddressCandidate]:
    ranked: list[AddressCandidate] = []

    for row in rows:
        score, reason = score_address_match(source_text, row)
        if score <= 0:
            continue

        ranked.append(
            AddressCandidate(
                address_id=str(getattr(row, "address_id")),
                score=score,
                reason=reason,
                payload={
                    "address_id": str(getattr(row, "address_id")),
                    "direction": getattr(row, "direction", None),
                    "partner_type": getattr(row, "partner_type", None),
                    "role_code": getattr(row, "role_code", None),
                    "address_name": getattr(row, "address_name", None),
                    "address_line1": getattr(row, "address_line1", None),
                    "address_line2": getattr(row, "address_line2", None),
                    "city": getattr(row, "city", None),
                    "state": getattr(row, "state", None),
                    "postal_code": getattr(row, "postal_code", None),
                    "country": getattr(row, "country", None),
                    "ship_to_code": getattr(row, "ship_to_code", None),
                    "sold_to_code": getattr(row, "sold_to_code", None),
                    "bill_to_code": getattr(row, "bill_to_code", None),
                    "supplier_code": getattr(row, "supplier_code", None),
                    "warehouse_code": getattr(row, "warehouse_code", None),
                    "delivery_location_code": getattr(row, "delivery_location_code", None),
                    "is_active": getattr(row, "is_active", None),
                },
            )
        )

    ranked.sort(key=lambda x: x.score, reverse=True)
    return ranked[:limit]