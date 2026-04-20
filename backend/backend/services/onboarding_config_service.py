from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP, ROUND_UP, ROUND_DOWN
from typing import Any

from sqlalchemy.orm import Session

from backend.db import models
from backend.db.models_rules_uom_mapping import (
    TradingPartnerBusinessRule,
    TradingPartnerMappingProfile,
    TradingPartnerOnboardingAudit,
    TradingPartnerUomRule,
)


ROUNDING_MAP = {
    "HALF_UP": ROUND_HALF_UP,
    "UP": ROUND_UP,
    "DOWN": ROUND_DOWN,
}


def write_audit(
    db: Session,
    *,
    client_id: str,
    partner_id: str,
    entity_type: str,
    entity_id: str,
    action: str,
    before_json: dict[str, Any] | None,
    after_json: dict[str, Any] | None,
    actor_email: str | None = None,
    actor_role: str | None = None,
    remarks: str | None = None,
) -> None:
    row = TradingPartnerOnboardingAudit(
        client_id=client_id,
        partner_id=partner_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        before_json=before_json,
        after_json=after_json,
        actor_email=actor_email,
        actor_role=actor_role,
        remarks=remarks,
    )
    db.add(row)


def _as_dict(model_obj) -> dict[str, Any]:
    return {c.name: getattr(model_obj, c.name) for c in model_obj.__table__.columns}


def apply_uom_conversion(
    db: Session,
    *,
    client_id: str,
    partner_id,
    qty: Decimal | float | int,
    input_uom: str,
    sold_to: str | None = None,
    ship_to: str | None = None,
    material_code: str | None = None,
    product_code: str | None = None,
) -> dict[str, Any]:
    qty_decimal = Decimal(str(qty))
    query = (
        db.query(TradingPartnerUomRule)
        .filter(
            TradingPartnerUomRule.client_id == client_id,
            TradingPartnerUomRule.partner_id == partner_id,
            TradingPartnerUomRule.input_uom == input_uom,
            TradingPartnerUomRule.is_active.is_(True),
        )
        .order_by(TradingPartnerUomRule.priority.asc(), TradingPartnerUomRule.created_at.asc())
    )

    for rule in query.all():
        if rule.sold_to and rule.sold_to != sold_to:
            continue
        if rule.ship_to and rule.ship_to != ship_to:
            continue
        if rule.material_code and rule.material_code != material_code:
            continue
        if rule.product_code and rule.product_code != product_code:
            continue
        if rule.min_quantity is not None and qty_decimal < Decimal(str(rule.min_quantity)):
            continue
        if rule.max_quantity is not None and qty_decimal > Decimal(str(rule.max_quantity)):
            continue

        factor = Decimal(str(rule.conversion_factor or 1))
        divider = Decimal(str(rule.conversion_divider or 1))
        converted = (qty_decimal * factor) / divider
        rounding = ROUNDING_MAP.get(rule.rounding_mode or "HALF_UP", ROUND_HALF_UP)
        quant = Decimal("1") if rule.rounding_digits == 0 else Decimal("1").scaleb(-rule.rounding_digits)
        converted = converted.quantize(quant, rounding=rounding)
        return {
            "applied": True,
            "uom_rule_id": str(rule.uom_rule_id),
            "input_qty": str(qty_decimal),
            "output_qty": str(converted),
            "output_uom": rule.output_uom,
        }

    return {
        "applied": False,
        "input_qty": str(qty_decimal),
        "output_qty": str(qty_decimal),
        "output_uom": input_uom,
    }


def evaluate_business_rules(
    db: Session,
    *,
    client_id: str,
    partner_id,
    payload: dict[str, Any],
    document_type: str = "PO",
    message_direction: str = "INBOUND",
) -> list[dict[str, Any]]:
    rules = (
        db.query(TradingPartnerBusinessRule)
        .filter(
            TradingPartnerBusinessRule.client_id == client_id,
            TradingPartnerBusinessRule.partner_id == partner_id,
            TradingPartnerBusinessRule.document_type == document_type,
            TradingPartnerBusinessRule.message_direction == message_direction,
            TradingPartnerBusinessRule.is_active.is_(True),
        )
        .order_by(TradingPartnerBusinessRule.priority.asc(), TradingPartnerBusinessRule.created_at.asc())
        .all()
    )

    results: list[dict[str, Any]] = []
    for rule in rules:
        condition = rule.condition_json or {}
        action = rule.action_json or {}
        matched = _match_condition(payload, condition)
        results.append(
            {
                "rule_id": str(rule.rule_id),
                "rule_name": rule.rule_name,
                "matched": matched,
                "rule_type": rule.rule_type,
                "action_json": action,
            }
        )
        if matched and rule.stop_on_match:
            break
    return results


def _match_condition(payload: dict[str, Any], condition: dict[str, Any]) -> bool:
    if not condition:
        return True

    field = condition.get("field")
    op = (condition.get("operator") or "eq").lower()
    value = condition.get("value")

    current = payload.get(field)
    if op == "eq":
        return current == value
    if op == "neq":
        return current != value
    if op == "contains":
        return str(value).lower() in str(current or "").lower()
    if op == "in":
        return current in (value or [])
    if op == "gt":
        return Decimal(str(current or 0)) > Decimal(str(value or 0))
    if op == "gte":
        return Decimal(str(current or 0)) >= Decimal(str(value or 0))
    if op == "lt":
        return Decimal(str(current or 0)) < Decimal(str(value or 0))
    if op == "lte":
        return Decimal(str(current or 0)) <= Decimal(str(value or 0))
    return False


def find_mapping_profile(
    db: Session,
    *,
    client_id: str,
    partner_id,
    document_type: str,
    input_format: str,
    sold_to: str | None = None,
    ship_to: str | None = None,
):
    profiles = (
        db.query(TradingPartnerMappingProfile)
        .filter(
            TradingPartnerMappingProfile.client_id == client_id,
            TradingPartnerMappingProfile.partner_id == partner_id,
            TradingPartnerMappingProfile.document_type == document_type,
            TradingPartnerMappingProfile.input_format == input_format,
            TradingPartnerMappingProfile.is_active.is_(True),
        )
        .order_by(
            TradingPartnerMappingProfile.is_default.desc(),
            TradingPartnerMappingProfile.priority.asc(),
            TradingPartnerMappingProfile.version_no.desc(),
        )
        .all()
    )

    for profile in profiles:
        if profile.sold_to and profile.sold_to != sold_to:
            continue
        if profile.ship_to and profile.ship_to != ship_to:
            continue
        return profile
    return None
