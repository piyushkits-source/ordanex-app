from backend.core.canonical_models import CanonicalDocument

def apply_universal_rules(doc: CanonicalDocument, profile: dict | None = None, rules: list[dict] | None = None, uom_rules: list[dict] | None = None) -> CanonicalDocument:
    profile = profile or {}
    rules = rules or []
    uom_rules = uom_rules or []
    if profile.get("po_date_source") == "RECEIVED_DATE" and doc.received_date:
        doc.document_date = doc.received_date
    for item in doc.line_items:
        for rule in uom_rules:
            if str(rule.get("input_uom") or "").upper() == str(item.uom or "").upper() and rule.get("output_uom"):
                factor = _to_float(rule.get("conversion_factor")) or 1.0
                divider = _to_float(rule.get("conversion_divider")) or 1.0
                if item.quantity is not None:
                    item.quantity = (item.quantity * factor) / divider
                item.uom = rule.get("output_uom")
    for rule in rules:
        if not rule.get("is_active", True):
            continue
        if _matches(doc, rule.get("condition_json") or {}):
            _apply_action(doc, rule.get("action_json") or {})
    return doc

def _matches(doc: CanonicalDocument, condition: dict) -> bool:
    field_name = condition.get("field")
    operator = condition.get("operator")
    value = condition.get("value")
    current = getattr(doc, field_name, None) if field_name else None
    if operator == "equals": return str(current or "") == str(value or "")
    if operator == "contains": return str(value or "") in str(current or "")
    if operator == "not_empty": return current not in [None, "", []]
    if operator == "is_empty": return current in [None, "", []]
    return False

def _apply_action(doc: CanonicalDocument, action: dict):
    action_type = action.get("type")
    target = action.get("target_field")
    value = action.get("value")
    if action_type in {"set_field", "append_suffix"} and target and hasattr(doc, target):
        current = getattr(doc, target, None)
        setattr(doc, target, f"{current or ''}{value or ''}" if action_type == "append_suffix" else value)

def _to_float(v):
    try:
        if v in [None, ""]: return None
        return float(v)
    except Exception:
        return None
