from __future__ import annotations

from sqlalchemy.orm import Session

from backend.db import models


def _get_value(payload: dict, field_name: str):
    if field_name.startswith("header."):
        return payload.get("header", {}).get(field_name.split(".", 1)[1])

    if field_name.startswith("derived."):
        return payload.get("derived", {}).get(field_name.split(".", 1)[1])

    return payload.get(field_name)


def _matches(condition: dict, payload: dict) -> bool:
    field_name = str(condition.get("field") or "")
    operator = str(condition.get("operator") or "eq").lower()
    expected = condition.get("value")
    actual = _get_value(payload, field_name)

    actual_str = str(actual or "")
    expected_str = str(expected or "")

    if operator == "eq":
        return actual_str == expected_str
    if operator == "neq":
        return actual_str != expected_str
    if operator == "contains":
        return expected_str.lower() in actual_str.lower()
    if operator == "in":
        values = expected if isinstance(expected, list) else [x.strip() for x in expected_str.split(",") if x.strip()]
        return actual_str in values
    if operator == "gt":
        return float(actual or 0) > float(expected or 0)
    if operator == "gte":
        return float(actual or 0) >= float(expected or 0)
    if operator == "lt":
        return float(actual or 0) < float(expected or 0)
    if operator == "lte":
        return float(actual or 0) <= float(expected or 0)

    return False


def apply_business_rules(db: Session, partner_id: str, working_payload: dict) -> tuple[dict, list[dict]]:
    rules = (
        db.query(models.TradingPartnerBusinessRule)
        .filter(
            models.TradingPartnerBusinessRule.partner_id == partner_id,
            models.TradingPartnerBusinessRule.is_active == True,  # noqa: E712
        )
        .order_by(models.TradingPartnerBusinessRule.priority.asc())
        .all()
    )

    audit: list[dict] = []
    payload = {**working_payload}

    for rule in rules:
        condition = rule.condition_json or {}
        action = rule.action_json or {}

        if not _matches(condition, payload):
            continue

        action_name = str(action.get("action") or "").upper()

        if action_name == "FLAG_REVIEW":
            payload["requires_review"] = True

        elif action_name == "REJECT":
            payload["rejected"] = True
            payload["reject_reason"] = action.get("reason") or rule.rule_name

        elif action_name == "SET_FIELD":
            target = action.get("target_field")
            value = action.get("value")
            if target and target.startswith("header."):
                payload.setdefault("header", {})[target.split(".", 1)[1]] = value

        elif action_name == "SET_DELIVERY_OFFSET":
            payload.setdefault("header", {})["delivery_offset_days"] = action.get("days", 0)

        elif action_name == "ROUTE_TO_CONNECTION":
            payload["route_connection_name"] = action.get("connection_name")

        audit.append(
            {
                "rule_id": str(rule.rule_id),
                "rule_name": rule.rule_name,
                "rule_type": rule.rule_type,
                "action": action_name,
            }
        )

        if rule.stop_on_match:
            break

    return payload, audit