from __future__ import annotations

from sqlalchemy.orm import Session

from backend.db import models


def apply_uom_rules(db: Session, partner_id: str, working_payload: dict) -> dict:
    items = working_payload.get("items", [])
    if not items:
        return working_payload

    rules = (
        db.query(models.TradingPartnerUomRule)
        .filter(
            models.TradingPartnerUomRule.partner_id == partner_id,
            models.TradingPartnerUomRule.is_active == True,  # noqa: E712
        )
        .order_by(models.TradingPartnerUomRule.priority.asc())
        .all()
    )

    normalized_items = []

    for item in items:
        material_code = str(item.get("material_code") or "").strip()
        product_code = str(item.get("product_code") or "").strip()
        input_uom = str(item.get("uom") or "").strip().upper()
        qty = float(item.get("quantity") or 0)

        applied = False

        for rule in rules:
            rule_material = str(rule.material_code or "").strip()
            rule_product = str(rule.product_code or "").strip()
            rule_input_uom = str(rule.input_uom or "").strip().upper()

            material_ok = not rule_material or rule_material == material_code
            product_ok = not rule_product or rule_product == product_code
            uom_ok = rule_input_uom == input_uom

            if material_ok and product_ok and uom_ok:
                factor = float(rule.conversion_factor or 1)
                divider = float(rule.conversion_divider or 1)
                quantity_out = qty * factor / divider if divider else qty

                item = {
                    **item,
                    "quantity_original": qty,
                    "uom_original": input_uom,
                    "quantity": round(quantity_out, int(rule.rounding_digits or 2)),
                    "uom": rule.output_uom,
                    "uom_rule_id": str(rule.uom_rule_id),
                }
                applied = True
                break

        if not applied:
            item = {**item, "quantity_original": qty, "uom_original": input_uom}

        normalized_items.append(item)

    return {**working_payload, "items": normalized_items}