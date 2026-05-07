from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
import re
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

    if operator == "regex":
        try:
            return bool(re.search(str(expected or ""), str(actual or ""), re.IGNORECASE))
        except re.error:
            return False

    if operator == "not_regex":
        try:
            return not bool(re.search(str(expected or ""), str(actual or ""), re.IGNORECASE))
        except re.error:
            return False

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
# TRANSFORMATION RULES
# =========================================================
def _safe_decimal(value: Any) -> Decimal | None:
    try:
        if value in [None, ""]:
            return None
        return Decimal(str(value))
    except Exception:
        return None


def _as_dict(rule: Any) -> dict[str, Any]:
    if isinstance(rule, dict):
        return dict(rule)
    if hasattr(rule, "model_dump"):
        try:
            return dict(rule.model_dump())
        except Exception:
            pass
    if hasattr(rule, "__dict__"):
        return {k: v for k, v in rule.__dict__.items() if not k.startswith("_")}
    return {}


def _apply_derived_measure_rule(item: dict[str, Any], rule: dict[str, Any]) -> tuple[bool, dict[str, Any]]:
    action = dict(rule.get("action_json") or {})
    if str(action.get("action") or "").upper() not in {"DERIVE_LINE_MEASURE", "DERIVE_MEASURE", "CALCULATE_LINE_MEASURE"}:
        return False, {}

    desc_field = str(action.get("description_field") or "description")
    qty_field = str(action.get("source_quantity_field") or "quantity")
    uom_field = str(action.get("source_uom_field") or "uom")
    divisor_field = str(action.get("divisor_field") or action.get("source_divisor_field") or "").strip()
    uom_source_field = str(action.get("uom_source_field") or action.get("source_uom_text_field") or "").strip()
    output_qty_field = str(action.get("output_quantity_field") or qty_field or "quantity")
    output_uom_field = str(action.get("output_uom_field") or uom_field or "uom")

    description = _text(item.get(desc_field))
    regex = _text(action.get("description_regex"))
    divisor = action.get("divide_by")
    divisor_source = _text(action.get("divisor_source"))
    divisor_group = _text(action.get("divisor_capture_group") or action.get("capture_group") or "divisor")

    if divisor in [None, ""] and divisor_field:
        divisor = item.get(divisor_field)

    if divisor in [None, ""] and divisor_source == "line_uom_factor":
        divisor = item.get("supplier_uom_conversion_factor") or item.get("line_uom_conversion_factor")

    if divisor in [None, ""] and regex:
        try:
            match = re.search(regex, description, re.IGNORECASE | re.DOTALL)
        except re.error:
            match = None
        if not match:
            return False, {"reason": "description_regex_not_matched"}
        if divisor in [None, ""]:
            try:
                if divisor_group.isdigit():
                    divisor = match.group(int(divisor_group))
                else:
                    divisor = match.group(divisor_group)
            except Exception:
                divisor = None

    if divisor in [None, ""]:
        divisor = action.get("divide_by_default") or action.get("fallback_divisor")

    qty = _safe_decimal(item.get(qty_field))
    if qty is None:
        return False, {"reason": "source_quantity_missing"}

    source_uom = _text(item.get(uom_field)).upper()
    expected_uom = _text(action.get("source_uom") or action.get("input_uom")).upper()
    if expected_uom and source_uom and source_uom != expected_uom:
        return False, {"reason": "source_uom_mismatch"}

    converted_qty = qty
    conversion_factor = action.get("conversion_factor")
    if conversion_factor not in [None, ""]:
        try:
            converted_qty = converted_qty * Decimal(str(conversion_factor))
        except Exception:
            pass

    if divisor not in [None, ""]:
        try:
            divisor_decimal = Decimal(str(divisor))
            if divisor_decimal != 0:
                converted_qty = converted_qty / divisor_decimal
        except Exception:
            pass

    rounding_digits = int(action.get("rounding_digits", 3) or 3)
    quant = Decimal("1") if rounding_digits == 0 else Decimal("1").scaleb(-rounding_digits)
    rounding = ROUND_HALF_UP
    try:
        converted_qty = converted_qty.quantize(quant, rounding=rounding)
    except Exception:
        pass

    output_uom = _text(action.get("output_uom") or action.get("target_uom") or item.get(uom_source_field) or source_uom or item.get(output_uom_field))
    item[output_qty_field] = float(converted_qty)
    item[output_uom_field] = output_uom or item.get(output_uom_field)
    item.setdefault("transformation_json", {})
    item["transformation_json"] = {
        "rule_name": rule.get("rule_name"),
        "action": action.get("action"),
        "description_regex": regex or None,
        "source_quantity": str(qty),
        "source_uom": source_uom or None,
        "divisor_field": divisor_field or None,
        "uom_source_field": uom_source_field or None,
        "output_quantity": str(converted_qty),
        "output_uom": output_uom or None,
    }
    return True, {"rule_name": rule.get("rule_name"), "output_quantity": str(converted_qty), "output_uom": output_uom or None}


def _apply_business_transformations(header: dict, items: List[dict], rules: List[dict] | None) -> tuple[dict, list[dict], list[dict], list[dict]]:
    header = dict(header or {})
    items = [dict(i) for i in (items or [])]
    applied_rules: list[dict] = []
    validation_hits: list[dict] = []
    rules = [ _as_dict(r) for r in (rules or []) ]
    rules = sorted([r for r in rules if r.get("is_active", True)], key=lambda r: int(r.get("priority", 9999) or 9999))

    for rule in rules:
        rule_name = _text(rule.get("rule_name")) or "Unnamed Rule"
        rule_type = _text(rule.get("rule_type")).lower()
        scope = _text(rule.get("scope")).lower() or ("item" if rule_type in {"transformation", "transform"} else "header")
        severity = _text(rule.get("severity")).upper() or "INFO"
        conditions = rule.get("conditions", {}) or rule.get("condition_json", {}) or {}
        actions = rule.get("actions", {}) or rule.get("action_json", {}) or {}

        # validation rules remain validation only
        if rule_type == "validation":
            if scope == "item":
                for idx, item in enumerate(items):
                    if _rule_matches(item, conditions):
                        validation_hits.append({"rule_name": rule_name, "scope": "item", "line_no": item.get("line_no", idx + 1), "severity": severity, "message": _text(rule.get("message")), "action": _text(rule.get("action"))})
            else:
                if _rule_matches(header, conditions):
                    validation_hits.append({"rule_name": rule_name, "scope": "header", "severity": severity, "message": _text(rule.get("message")), "action": _text(rule.get("action"))})
            continue

        # transformation rules
        if rule_type in {"transformation", "transform"} and scope == "item":
            matched_any = False
            for item in items:
                if not _rule_matches(item, conditions):
                    continue
                matched_any = True
                ok, meta = _apply_derived_measure_rule(item, rule)
                if ok:
                    applied_rules.append({"rule_name": rule_name, "scope": "item", "severity": severity, "action": actions.get("action") or "DERIVE_LINE_MEASURE", "meta": meta})
            if matched_any and not any(r.get("rule_name") == rule_name for r in applied_rules):
                applied_rules.append({"rule_name": rule_name, "scope": "item", "severity": severity, "action": actions.get("action") or "TRANSFORMATION"})
            continue

        if scope == "header":
            if _rule_matches(header, conditions):
                if rule_type in {"header_default", "header_override"}:
                    for field, value in actions.items():
                        if rule_type == "header_default":
                            if header.get(field) in [None, ""]:
                                header[field] = value
                        else:
                            header[field] = value
                    applied_rules.append({"rule_name": rule_name, "scope": "header", "severity": severity, "actions": actions})

        elif scope == "item":
            matched_any = False
            for item in items:
                if _rule_matches(item, conditions):
                    matched_any = True
                    if rule_type in {"item_default", "item_override"}:
                        for field, value in actions.items():
                            if rule_type == "item_default":
                                if item.get(field) in [None, ""]:
                                    item[field] = value
                            else:
                                item[field] = value
            if matched_any:
                applied_rules.append({"rule_name": rule_name, "scope": "item", "severity": severity, "actions": actions})

    return header, items, applied_rules, validation_hits


# =========================================================
# UOM RULES
# =========================================================
def apply_uom_rules(items: List[dict], header: dict, uom_rules: List[dict] | None):
    if not uom_rules:
        return items

    for item in items:
        current_uom = _text(item.get("uom")).upper()

        for rule in uom_rules:
            source = _text(rule.get("source_uom") or rule.get("input_uom")).upper()
            target = _text(rule.get("target_uom") or rule.get("output_uom")).upper()
            factor = rule.get("conversion_factor")
            divider = rule.get("conversion_divider")

            if current_uom == source and target:
                item["uom"] = target

                if item.get("quantity") not in [None, ""]:
                    try:
                        qty = Decimal(str(item["quantity"]))
                        if factor not in [None, ""]:
                            qty = qty * Decimal(str(factor))
                        if divider not in [None, ""]:
                            divider_decimal = Decimal(str(divider))
                            if divider_decimal != 0:
                                qty = qty / divider_decimal
                        digits = int(rule.get("rounding_digits", 3) or 3)
                        quant = Decimal("1") if digits == 0 else Decimal("1").scaleb(-digits)
                        item["quantity"] = float(qty.quantize(quant, rounding=ROUND_HALF_UP))
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
def _apply_simple_rules(
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
        scope = _text(rule.get("scope")).lower() or ("item" if rule_type in {"transformation", "transform"} else "header")
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

# =============================================================================
# Public entry point — dispatches to the right rule pipeline based on call site
# =============================================================================
#
# There are two calling styles in the codebase:
#
#  1) Simple (test bench, universal_rules_engine, internal recursion):
#       apply_rule_engine(header=..., items=..., rules=...)
#       → returns {'header', 'items', 'applied_rules', 'validation_hits'}
#
#  2) Rich (idoc_mapping_orchestrator):
#       apply_rule_engine(db, som, date_rules=..., duplicate_rule=...,
#                         uom_rules=..., business_rules=..., split_rule=...)
#       → returns {'som', 'split_docs', 'applied_rules', 'validation_hits'}
#
# The wrapper below accepts both and routes accordingly.
# =============================================================================

def apply_rule_engine(
    *args,
    header: dict | None = None,
    items: List[dict] | None = None,
    rules: List[dict] | None = None,
    db=None,
    som: dict | None = None,
    date_rules=None,
    duplicate_rule=None,
    uom_rules=None,
    business_rules=None,
    split_rule=None,
) -> dict:
    """
    Dual-mode rule engine entry point. See module docstring above.
    """
    # Accept the orchestrator's positional (db, som) call style
    if len(args) >= 2:
        if db is None:
            db = args[0]
        if som is None:
            som = args[1]
    elif len(args) == 1 and som is None:
        som = args[0]

    is_rich_call = (
        som is not None
        or date_rules is not None
        or duplicate_rule is not None
        or uom_rules is not None
        or business_rules is not None
        or split_rule is not None
    )

    if is_rich_call:
        return _apply_rich_pipeline(
            db=db,
            som=som or {},
            date_rules=date_rules,
            duplicate_rule=duplicate_rule,
            uom_rules=uom_rules,
            business_rules=business_rules,
            split_rule=split_rule,
        )

    # Simple call — delegate to the original function body
    return _apply_simple_rules(
        header=header or {},
        items=items or [],
        rules=rules,
    )


def _apply_rich_pipeline(
    *,
    db,
    som: dict,
    date_rules=None,
    duplicate_rule=None,
    uom_rules=None,
    business_rules=None,
    split_rule=None,
) -> dict:
    """
    Orchestrator pipeline.

    Today each rule category is optional. When nothing is configured
    (partner_uom_rules empty, no date/split rules saved, etc.) this is a
    near no-op and the SOM passes through unchanged, producing a valid return
    shape for the orchestrator.

    As the rule admin UIs populate real rules, each branch below can be
    extended incrementally without changing this signature.
    """
    applied_rules: list[dict] = []
    validation_hits: list[dict] = []

    # Extract header + items from the SOM (supports both "header" and "order_header" keys)
    header = dict(som.get("header") or som.get("order_header") or {})
    items = [dict(i) for i in (som.get("items") or [])]

    # --- 1. Date rules ---------------------------------------------------------
    if date_rules:
        try:
            from backend.services.date_rule_service import (
                apply_date_rules_to_header_and_items,
            )
            header, items = apply_date_rules_to_header_and_items(
                header, items, date_rules
            )
            applied_rules.append({"type": "date_rules", "status": "applied"})
        except Exception as exc:
            validation_hits.append(
                {
                    "scope": "pipeline",
                    "rule_name": "date_rules",
                    "severity": "WARNING",
                    "message": f"Date rule application failed: {exc}",
                }
            )

    # --- 2. Business rules (operator conditions driven — see business_rules_engine) ----
    # Today no-op; the engine file exists but isn't wired into the pipeline yet.
    if business_rules:
        applied_rules.append(
            {"type": "business_rules", "status": "skipped_not_wired"}
        )

    # --- 3. UOM rules ---------------------------------------------------------
    # partner_uom_rules table is currently empty; when populated, this branch
    # will call into the UOM conversion service. For now, leave items unchanged.
    if uom_rules:
        applied_rules.append({"type": "uom_rules", "status": "skipped_not_wired"})

    # --- 4. Duplicate rule ----------------------------------------------------
    # Reserved for duplicate-PO detection logic.
    if duplicate_rule:
        applied_rules.append(
            {"type": "duplicate_rule", "status": "skipped_not_wired"}
        )

    # --- 5. Split rule --------------------------------------------------------
    # split_items returns a list of {split_key, items}. The orchestrator
    # expects pipeline["split_docs"] to be iterable of documents.
    split_docs: list[dict] = []
    if split_rule:
        try:
            from backend.services.split_rule_service import split_items
            split_groups = split_items(items, split_rule)
            for group in split_groups:
                split_docs.append(
                    {
                        **som,
                        "header": dict(header),
                        "items": list(group.get("items") or []),
                        "split_key": group.get("split_key"),
                    }
                )
            applied_rules.append(
                {
                    "type": "split_rule",
                    "status": "applied",
                    "groups": len(split_docs),
                }
            )
        except Exception as exc:
            validation_hits.append(
                {
                    "scope": "pipeline",
                    "rule_name": "split_rule",
                    "severity": "WARNING",
                    "message": f"Split rule application failed: {exc}",
                }
            )

    # If no split was requested (or it produced nothing), emit a single doc
    # so the orchestrator always has a list to iterate on.
    if not split_docs:
        split_docs = [
            {
                **som,
                "header": dict(header),
                "items": list(items),
                "split_key": "ALL",
            }
        ]

    # --- Reassemble the final SOM --------------------------------------------
    final_som = dict(som)
    if "order_header" in final_som:
        final_som["order_header"] = header
    else:
        final_som["header"] = header
    final_som["items"] = items

    return {
        "som": final_som,
        "split_docs": split_docs,
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

    result = _apply_simple_rules(
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
