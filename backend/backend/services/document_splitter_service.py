from __future__ import annotations

import hashlib
from typing import Any


def _detect_x12_element_separator(text: str) -> str:
    stripped = (text or "").strip()
    if stripped.startswith("ISA") and len(stripped) > 3 and not stripped[3].isalnum():
        return stripped[3]
    if "*" in stripped:
        return "*"
    if "~" in stripped:
        return "~"
    return "*"


def _split_x12_segments(text: str) -> list[str]:
    stripped = (text or "").strip()
    if not stripped:
        return []

    if "\n" in stripped:
        return [line.strip() for line in stripped.splitlines() if line.strip()]

    segment_sep = "~" if "~" in stripped else "\n"
    return [segment.strip() for segment in stripped.split(segment_sep) if segment.strip()]


def _split_edifact_segments(text: str) -> list[str]:
    stripped = (text or "").strip()
    if not stripped:
        return []
    return [segment.strip() for segment in stripped.split("'") if segment.strip()]


def _build_split_key(source_format: str, raw_text: str) -> str:
    digest = hashlib.sha1((raw_text or "").encode("utf-8", errors="ignore")).hexdigest()[:12]
    return f"{source_format.upper()}-{digest}"


def split_x12_documents(raw_text: str) -> list[dict[str, Any]]:
    segments = _split_x12_segments(raw_text)
    if not segments:
        return []

    prefix_segments: list[str] = []
    transaction_groups: list[list[str]] = []
    current_group: list[str] | None = None
    element_sep = _detect_x12_element_separator(raw_text)

    for segment in segments:
        tag = segment.split(element_sep)[0].strip() if element_sep in segment else segment[:3].strip()

        if tag in {"ISA", "GS"} and current_group is None:
            prefix_segments.append(segment)
            continue

        if tag == "ST":
            if current_group:
                transaction_groups.append(current_group)
            current_group = [segment]
            continue

        if current_group is not None:
            current_group.append(segment)
            if tag == "SE":
                transaction_groups.append(current_group)
                current_group = None

    if current_group:
        transaction_groups.append(current_group)

    if len(transaction_groups) <= 1:
        return []

    split_key = _build_split_key("X12", raw_text)
    documents: list[dict[str, Any]] = []
    for idx, group in enumerate(transaction_groups, start=1):
        segment_lines = [*prefix_segments, *group]
        documents.append(
            {
                "raw_text": "\n".join(segment_lines),
                "split_sequence": idx,
                "split_key": split_key,
                "source_locator_json": {"segment_range": {"start": group[0], "end": group[-1]}},
            }
        )
    return documents


def split_edifact_documents(raw_text: str) -> list[dict[str, Any]]:
    segments = _split_edifact_segments(raw_text)
    if not segments:
        return []

    interchange_prefix: list[str] = []
    message_groups: list[list[str]] = []
    current_group: list[str] | None = None

    for segment in segments:
        tag = segment.split("+")[0].strip()

        if tag == "UNB" and current_group is None:
            interchange_prefix.append(segment)
            continue

        if tag == "UNH":
            if current_group:
                message_groups.append(current_group)
            current_group = [segment]
            continue

        if current_group is not None:
            current_group.append(segment)
            if tag == "UNT":
                message_groups.append(current_group)
                current_group = None

    if current_group:
        message_groups.append(current_group)

    if len(message_groups) <= 1:
        return []

    split_key = _build_split_key("EDIFACT", raw_text)
    documents: list[dict[str, Any]] = []
    for idx, group in enumerate(message_groups, start=1):
        segment_lines = [*interchange_prefix, *group]
        documents.append(
            {
                "raw_text": "'".join(segment_lines) + "'",
                "split_sequence": idx,
                "split_key": split_key,
                "source_locator_json": {"segment_range": {"start": group[0], "end": group[-1]}},
            }
        )
    return documents


def split_documents(source_format: str | None, raw_text: str) -> list[dict[str, Any]]:
    normalized = (source_format or "").strip().upper()

    if normalized == "X12":
        return split_x12_documents(raw_text)
    if normalized == "EDIFACT":
        return split_edifact_documents(raw_text)
    return []
