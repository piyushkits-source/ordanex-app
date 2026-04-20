
from __future__ import annotations

from datetime import date, datetime, timedelta


def add_business_days(start_date: date, days: int) -> date:
    current = start_date
    remaining = int(days or 0)
    while remaining > 0:
        current += timedelta(days=1)
        if current.weekday() < 5:
            remaining -= 1
    return current


def _parse_date(value) -> date | None:
    if not value:
        return None
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%b/%Y", "%d/%B/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except Exception:
            pass
    return None


def resolve_po_date(source_po_date, po_date_rule: dict | None) -> str | None:
    rule = po_date_rule or {"mode": "from_po"}
    mode = rule.get("mode", "from_po")
    if mode == "current_date":
        return date.today().isoformat()
    parsed = _parse_date(source_po_date)
    return parsed.isoformat() if parsed else None


def resolve_delivery_date(source_delivery_date, resolved_po_date, delivery_date_rule: dict | None) -> str | None:
    rule = delivery_date_rule or {"mode": "from_po"}
    mode = rule.get("mode", "from_po")

    source_delivery_dt = _parse_date(source_delivery_date)
    po_dt = _parse_date(resolved_po_date)

    if mode == "from_po":
        return source_delivery_dt.isoformat() if source_delivery_dt else None
    if mode == "current_date":
        return date.today().isoformat()
    if mode == "po_date_plus_business_days":
        if not po_dt:
            return None
        return add_business_days(po_dt, int(rule.get("days", 0))).isoformat()
    if mode == "current_date_plus_business_days":
        return add_business_days(date.today(), int(rule.get("days", 0))).isoformat()
    if mode == "fixed_date":
        fixed = _parse_date(rule.get("fixed_date"))
        return fixed.isoformat() if fixed else None

    return source_delivery_dt.isoformat() if source_delivery_dt else None


def apply_date_rules_to_header_and_items(header: dict, items: list[dict], date_rules: dict | None) -> tuple[dict, list[dict]]:
    date_rules = date_rules or {}
    po_date_rule = date_rules.get("po_date_rule", {"mode": "from_po"})
    delivery_date_rule = date_rules.get("delivery_date_rule", {"mode": "from_po"})

    header = dict(header or {})
    items = [dict(x) for x in (items or [])]

    resolved_po_date = resolve_po_date(header.get("po_date"), po_date_rule)
    header["po_date"] = resolved_po_date

    for item in items:
        item["delivery_date"] = resolve_delivery_date(
            item.get("delivery_date"),
            resolved_po_date,
            delivery_date_rule,
        )
    return header, items
