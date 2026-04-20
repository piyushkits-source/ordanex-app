from __future__ import annotations

from typing import Any, Dict, List, Tuple


# =========================================================
# HELPERS
# =========================================================
def _safe_float(val, default=None):
    try:
        if val in [None, ""]:
            return default
        return float(val)
    except Exception:
        return default


def _text(val) -> str:
    return str(val or "").strip()


def _match_condition(item_or_header: dict, field: str, operator: str, expected: Any) -> bool:
    actual = item_or_header.get(field)

    if operator == "equals":
        return actual == expected

    if operator == "not_equals":
        return actual != expected

    if operator == "contains":
        return str(expected or "").lower() in str(actual or "").lower()

    if operator == "blank":
        return actual in [None, ""]

    if operator == "not_blank":
        return actual not in [None, ""]

    if operator == "gt":
        a = _safe_float(actual)
        b = _safe_float(expected)
        return a is not None and b is not None and a > b

    if operator == "lt":
        a = _safe_float(actual)
        b = _safe_float(expected)
        return a is not None and b is not None and a < b

    if operator == "gte":
        a = _safe_float(actual)
        b = _safe_float(expected)
        return a is not None and b is not None and a >= b

    if operator == "lte":
        a = _safe_float(actual)
        b = _safe_float(expected)
        return a is not None and b is not None and a <= b

    return False


def _rule_matches(target: dict, conditions: dict) -> bool:
    if not conditions:
        return True

    for field, rule_val in conditions.items():
        # shorthand direct equals
        if not isinstance(rule_val, dict):
            if target.get(field) != rule_val:
                return False
            continue

        operator = rule_val.get("operator", "equals")
        expected = rule_val.get("value")
        if not _match_condition(target, field, operator, expected):
            return False

    return True


# =========================================================
# UOM RULES
# =========================================================
def apply_uom_rules(items: List[dict], header: dict, uom_rules: List[dict] | None):
    if not uom_rules:
        return items

    for item in items:
        current_uom = _text(item.get("uom")).upper()

        for rule in uom_rules:
            source = _text(rule.get("source_uom")).upper()
            target = _text(rule.get("target_uom")).upper()
            factor = rule.get("conversion_factor")

            if current_uom == source and target:
                item["uom"] = target

                if factor and item.get("quantity") not in [None, ""]:
                    try:
                        item["quantity"] = float(item["quantity"]) * float(factor)
                    except Exception:
                        pass
                break

    return items

def resolve_best_uom_rule(item, uom_rules):
    def score(rule):
        s = 0

        if rule.get("material_code") and rule.get("material_code") == getattr(item, "material_code", None):
            s += 50
        if rule.get("product_code") and rule.get("product_code") == getattr(item, "product_code", None):
            s += 45
        if rule.get("ship_to_code") and rule.get("ship_to_code") == getattr(item, "ship_to_code", None):
            s += 30
        if rule.get("customer_code") and rule.get("customer_code") == getattr(item, "customer_code", None):
            s += 20
        if rule.get("supplier_code") and rule.get("supplier_code") == getattr(item, "supplier_code", None):
            s += 20

        s += max(0, 1000 - int(rule.get("priority", 100)))
        return s

    candidates = []
    for rule in uom_rules:
        if not rule.get("is_active", True):
            continue
        if str(rule.get("input_uom") or "").upper() != str(getattr(item, "uom", "") or "").upper():
            continue
        candidates.append(rule)

    if not candidates:
        return None

    candidates.sort(key=score, reverse=True)
    return candidates[0]


# =========================================================
# SIMPLE BUSINESS RULES
# =========================================================
def apply_business_rules(
    items: List[dict],
    header: dict,
    rules: List[dict] | None,
) -> Tuple[List[dict], dict]:
    if not rules:
        return items, header

    for rule in rules:
        rule_type = _text(rule.get("rule_type")).lower()

        # header_default
        if rule_type == "header_default":
            field = rule.get("field")
            value = rule.get("value")
            if field and not header.get(field):
                header[field] = value

        # item_filter
        elif rule_type == "item_filter":
            field = rule.get("field")
            operator = rule.get("operator")
            value = rule.get("value")

            def keep(item):
                return _match_condition(item, field, operator, value)

            items = [i for i in items if keep(i)]

        # item_enrichment
        elif rule_type == "item_enrichment":
            field = rule.get("field")
            value = rule.get("value")
            for item in items:
                if not item.get(field):
                    item[field] = value

        # derive_amount
        elif rule_type == "derive_amount":
            for item in items:
                qty = item.get("quantity")
                price = item.get("unit_price")
                if qty not in [None, ""] and price not in [None, ""] and not item.get("amount"):
                    try:
                        item["amount"] = round(float(qty) * float(price), 4)
                    except Exception:
                        pass

    return items, header


# =========================================================
# GENERIC RULE ENGINE
# =========================================================
def apply_rule_engine(
    header: dict,
    items: List[dict],
    rules: List[dict] | None,
) -> dict:
    """
    Generic rule engine used by orchestrators and testbench.

    Expected rule examples:
    {
        "is_active": True,
        "priority": 10,
        "rule_name": "Default currency",
        "rule_type": "header_default",
        "severity": "INFO",
        "conditions": {"currency": {"operator": "blank"}},
        "actions": {"currency": "USD"}
    }

    Validation rule:
    {
        "is_active": True,
        "priority": 20,
        "rule_name": "Block zero quantity",
        "rule_type": "validation",
        "scope": "item",
        "severity": "BLOCKER",
        "conditions": {"quantity": {"operator": "lte", "value": 0}},
        "message": "Quantity must be greater than zero",
        "action": "Correct quantity"
    }
    """
    header = dict(header or {})
    items = [dict(i) for i in (items or [])]
    rules = list(rules or [])

    rules = sorted(
        [r for r in rules if r.get("is_active", True)],
        key=lambda r: int(r.get("priority", 9999) or 9999),
    )

    applied_rules = []
    validation_hits = []

    for rule in rules:
        rule_name = _text(rule.get("rule_name")) or "Unnamed Rule"
        rule_type = _text(rule.get("rule_type")).lower()
        scope = _text(rule.get("scope")).lower() or "header"
        severity = _text(rule.get("severity")).upper() or "INFO"
        conditions = rule.get("conditions", {}) or {}
        actions = rule.get("actions", {}) or {}

        # ----------------------------------------
        # VALIDATION RULES
        # ----------------------------------------
        if rule_type == "validation":
            if scope == "item":
                for idx, item in enumerate(items):
                    if _rule_matches(item, conditions):
                        validation_hits.append(
                            {
                                "rule_name": rule_name,
                                "scope": "item",
                                "line_no": item.get("line_no", idx + 1),
                                "severity": severity,
                                "message": _text(rule.get("message")),
                                "action": _text(rule.get("action")),
                            }
                        )
            else:
                if _rule_matches(header, conditions):
                    validation_hits.append(
                        {
                            "rule_name": rule_name,
                            "scope": "header",
                            "severity": severity,
                            "message": _text(rule.get("message")),
                            "action": _text(rule.get("action")),
                        }
                    )
            continue

        # ----------------------------------------
        # HEADER RULES
        # ----------------------------------------
        if scope == "header":
            if _rule_matches(header, conditions):
                if rule_type in {"header_default", "header_override"}:
                    for field, value in actions.items():
                        if rule_type == "header_default":
                            if header.get(field) in [None, ""]:
                                header[field] = value
                        else:
                            header[field] = value

                    applied_rules.append(
                        {
                            "rule_name": rule_name,
                            "scope": "header",
                            "severity": severity,
                            "actions": actions,
                        }
                    )

        # ----------------------------------------
        # ITEM RULES
        # ----------------------------------------
        elif scope == "item":
            matched_any = False
            for item in items:
                if _rule_matches(item, conditions):
                    matched_any = True

                    if rule_type in {"item_default", "item_override", "uom_conversion"}:
                        for field, value in actions.items():
                            if rule_type == "item_default":
                                if item.get(field) in [None, ""]:
                                    item[field] = value
                            else:
                                item[field] = value

            if matched_any:
                applied_rules.append(
                    {
                        "rule_name": rule_name,
                        "scope": "item",
                        "severity": severity,
                        "actions": actions,
                    }
                )

    return {
        "header": header,
        "items": items,
        "applied_rules": applied_rules,
        "validation_hits": validation_hits,
    }

def apply_rules(som: dict) -> dict:
    """
    Compatibility wrapper for APIs/services that expect apply_rules(som).
    Applies generic rule engine only if rules are present in som["rules"].
    """
    som = dict(som or {})

    header = dict(
        som.get("order_header")
        or som.get("header")
        or {}
    )

    items = list(som.get("items") or [])
    rules = list(som.get("rules") or [])

    if not rules:
        return som

    result = apply_rule_engine(
        header=header,
        items=items,
        rules=rules,
    )

    if "order_header" in som:
        som["order_header"] = result["header"]
    else:
        som["header"] = result["header"]

    som["items"] = result["items"]
    som["applied_rules"] = result.get("applied_rules", [])
    som["validation_hits"] = result.get("validation_hits", [])

    return som