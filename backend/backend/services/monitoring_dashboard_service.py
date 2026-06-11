from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta
from backend.core.environment import current_environment
from backend.db import models

SUCCESS_STATUSES = {"SUCCESS", "PROCESSED", "DELIVERED", "REPROCESSED"}
FAILED_STATUSES = {"ERROR", "FAILED", "DELIVERY_FAILED", "BLOCKED"}
PENDING_STATUSES = {"PENDING", "NEW", "PARSED", "CORRECTED", "PROCESSING", "REPROCESSING"}



def _normalize_environment(value: str | None) -> str:
    raw = str(value or "").strip().lower()
    if raw in {"prod", "production"}:
        return "production"
    return "staging"


def _classify_status(status: str) -> str:
    if status in SUCCESS_STATUSES:
        return "success"
    if status in FAILED_STATUSES:
        return "failed"
    if status in PENDING_STATUSES:
        return "pending"
    return "other"


def _safe_iso(dt) -> str | None:
    if not dt:
        return None
    try:
        return dt.isoformat()
    except Exception:
        return str(dt)


def get_monitoring_summary(
    db,
    *,
    environment: str | None = None,
    client_id: str | None = None,
    vertical_id: str | None = None,
    partner_id: str | None = None,
) -> dict:
    env = _normalize_environment(environment or current_environment())
    rows = db.query(models.PurchaseOrder).all()

    partner_rows = db.query(models.TradingPartner).all()
    partner_by_id = {str(row.partner_id): row for row in partner_rows}
    partner_index = {}
    for row in partner_rows:
        for key in {
            str(getattr(row, "partner_name", "") or "").strip().lower(),
            str(getattr(row, "partner_code", "") or "").strip().lower(),
            str(getattr(row, "email", "") or "").strip().lower(),
        }:
            if key:
                partner_index[key] = row

    selected_partner = partner_by_id.get(str(partner_id)) if partner_id else None
    selected_vertical = str(vertical_id) if vertical_id else None
    selected_client = str(client_id) if client_id else None

    def resolve_partner(row):
        for raw in [
            getattr(row, "receiver", None),
            getattr(row, "supplier_name", None),
            getattr(row, "sender", None),
            getattr(row, "ship_to_name", None),
            getattr(row, "ship_to", None),
        ]:
            key = str(raw or "").strip().lower()
            if key and key in partner_index:
                return partner_index[key]
        return None

    filtered = []
    for row in rows:
        row_env = _normalize_environment(getattr(row, "environment", None))
        if row_env == env:
            if selected_client and str(getattr(row, "client_id", None) or "") != selected_client:
                continue

            partner = resolve_partner(row)
            if selected_partner and (not partner or str(partner.partner_id) != str(selected_partner.partner_id)):
                continue
            if selected_vertical and (not partner or str(getattr(partner, "vertical_id", None) or "") != selected_vertical):
                continue

            filtered.append(row)

    by_connector = Counter()
    by_status = Counter()

    for row in filtered:
        status = (getattr(row, "status", None) or "UNKNOWN").upper()
        by_status[status] += 1
        connector = (
            getattr(row, "connector_used", None)
            or getattr(row, "target_protocol", None)
            or getattr(row, "source_type", None)
            or "UNKNOWN"
        )
        by_connector[str(connector).upper()] += 1

    total = len(filtered)
    success = sum(v for k, v in by_status.items() if k in SUCCESS_STATUSES)
    failed = sum(v for k, v in by_status.items() if k in FAILED_STATUSES)
    pending = sum(v for k, v in by_status.items() if k in PENDING_STATUSES)

    now = datetime.utcnow()
    recent_cutoff = now - timedelta(days=7)
    daily_volume = {}
    manual_touch = 0
    auto_processed = 0
    recent_exceptions = []
    top_clients = Counter()
    top_suppliers = Counter()
    processing_latency_hours = []

    for day_offset in range(6, -1, -1):
        key = (now - timedelta(days=day_offset)).date().isoformat()
        daily_volume[key] = {"date": key, "total": 0, "success": 0, "failed": 0, "pending": 0}

    for row in filtered:
        status = (getattr(row, "status", None) or "UNKNOWN").upper()
        status_group = _classify_status(status)

        created_at = getattr(row, "created_at", None)
        created_key = created_at.date().isoformat() if created_at else None
        if created_key in daily_volume:
            daily_volume[created_key]["total"] += 1
            daily_volume[created_key][status_group] += 1

        if status in {"CORRECTED", "PENDING", "ERROR", "FAILED"} or bool(getattr(row, "needs_review", False)):
            manual_touch += 1
        else:
            auto_processed += 1

        top_clients[str(getattr(row, "client_id", None) or "UNKNOWN")] += 1
        supplier_name = (
            getattr(row, "receiver", None)
            or getattr(row, "supplier_name", None)
            or "UNKNOWN"
        )
        top_suppliers[str(supplier_name)] += 1

        processed_at = getattr(row, "processed_at", None)
        if created_at and processed_at:
            try:
                processing_latency_hours.append(max((processed_at - created_at).total_seconds() / 3600.0, 0))
            except Exception:
                pass

        if status in FAILED_STATUSES or status == "CORRECTED":
            stamp = processed_at or created_at
            if stamp and stamp >= recent_cutoff:
                recent_exceptions.append(
                    {
                        "po_id": str(getattr(row, "po_id", "")),
                        "po_number": getattr(row, "po_number", None),
                        "status": status,
                        "client_id": getattr(row, "client_id", None),
                        "sender": getattr(row, "sender", None),
                        "receiver": getattr(row, "receiver", None) or getattr(row, "supplier_name", None),
                        "source_type": getattr(row, "source_type", None),
                        "connector_used": getattr(row, "connector_used", None),
                        "created_at": _safe_iso(created_at),
                        "processed_at": _safe_iso(processed_at),
                        "reason": getattr(row, "po_validation_reason", None) or getattr(row, "delivery_response_text", None),
                    }
                )

    recent_exceptions.sort(
        key=lambda item: item.get("processed_at") or item.get("created_at") or "",
        reverse=True,
    )

    avg_latency = (
        round(sum(processing_latency_hours) / len(processing_latency_hours), 2)
        if processing_latency_hours
        else 0
    )

    return {
        "environment": env.upper(),
        "client_id": selected_client,
        "vertical_id": selected_vertical,
        "partner_id": str(selected_partner.partner_id) if selected_partner else None,
        "total": total,
        "success": success,
        "failed": failed,
        "pending": pending,
        "by_connector": dict(by_connector),
        "by_status": dict(by_status),
        "daily_volume": list(daily_volume.values()),
        "manual_touch_count": manual_touch,
        "auto_processed_count": auto_processed,
        "manual_touch_rate": round((manual_touch / total) * 100, 2) if total else 0,
        "avg_processing_latency_hours": avg_latency,
        "top_clients": [
            {"label": key, "value": value}
            for key, value in top_clients.most_common(5)
        ],
        "top_suppliers": [
            {"label": key, "value": value}
            for key, value in top_suppliers.most_common(5)
        ],
        "recent_exceptions": recent_exceptions[:10],
    }
