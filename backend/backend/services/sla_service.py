from __future__ import annotations

from datetime import datetime
from typing import Any


DEFAULT_SLA = {
    "processing_minutes": 5,
    "approval_minutes": 30,
    "delivery_minutes": 10,
    "end_to_end_minutes": 45,
}


def _minutes_between(start, end) -> float | None:
    if not start or not end:
        return None
    delta = end - start
    return round(delta.total_seconds() / 60.0, 2)


def _sla_state(actual_minutes: float | None, limit_minutes: int | None) -> str:
    if actual_minutes is None or limit_minutes is None:
        return "PENDING"
    if actual_minutes <= limit_minutes:
        return "ON_TRACK"
    if actual_minutes <= (limit_minutes * 1.2):
        return "AT_RISK"
    return "BREACHED"


def compute_po_sla(po, sla_cfg: dict | None = None) -> dict:
    cfg = {**DEFAULT_SLA, **(sla_cfg or {})}

    received_at = getattr(po, "received_at", None) or getattr(po, "created_at", None)
    processed_at = getattr(po, "processed_at", None)
    approved_at = getattr(po, "approved_at", None)
    delivered_at = getattr(po, "delivered_at", None)

    processing_tat = _minutes_between(received_at, processed_at)
    approval_tat = _minutes_between(processed_at, approved_at)
    delivery_tat = _minutes_between(approved_at, delivered_at)
    end_to_end_tat = _minutes_between(received_at, delivered_at)

    processing_state = _sla_state(processing_tat, cfg.get("processing_minutes"))
    approval_state = _sla_state(approval_tat, cfg.get("approval_minutes"))
    delivery_state = _sla_state(delivery_tat, cfg.get("delivery_minutes"))
    end_to_end_state = _sla_state(end_to_end_tat, cfg.get("end_to_end_minutes"))

    overall = "ON_TRACK"
    if "BREACHED" in {processing_state, approval_state, delivery_state, end_to_end_state}:
        overall = "BREACHED"
    elif "AT_RISK" in {processing_state, approval_state, delivery_state, end_to_end_state}:
        overall = "AT_RISK"
    elif "PENDING" in {processing_state, approval_state, delivery_state, end_to_end_state}:
        overall = "IN_PROGRESS"

    return {
        "processing_tat_minutes": processing_tat,
        "approval_tat_minutes": approval_tat,
        "delivery_tat_minutes": delivery_tat,
        "end_to_end_tat_minutes": end_to_end_tat,
        "processing_sla_state": processing_state,
        "approval_sla_state": approval_state,
        "delivery_sla_state": delivery_state,
        "end_to_end_sla_state": end_to_end_state,
        "overall_sla_state": overall,
        "sla_config": cfg,
    }
