from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from backend.db import models
from backend.services.vendor_learning_service import vendor_learning_service


HEADER_ALIASES = {
    "po_number": "document_number",
    "document_number": "document_number",
    "docnum": "document_number",
    "po_date": "document_date",
    "document_date": "document_date",
    "currency": "currency_code",
    "currency_code": "currency_code",
    "ship_to": "ship_to_code",
    "ship_to_code": "ship_to_code",
    "customer": "customer_name",
    "buyer": "customer_name",
    "customer_name": "customer_name",
    "supplier": "supplier_name",
    "vendor": "supplier_name",
    "supplier_name": "supplier_name",
    "document_type": "document_type",
    "po_type": "document_type",
    "order_type": "order_type",
}

ITEM_ALIASES = {
    "material": "material_code",
    "material_code": "material_code",
    "mapped_product": "mapped_product",
    "product_code": "material_code",
    "description": "description",
    "line_details": "line_details",
    "quantity": "quantity",
    "mapped_quantity": "mapped_quantity",
    "uom": "customer_uom",
    "customer_uom": "customer_uom",
    "unit_price": "unit_price",
    "amount": "amount",
    "delivery_date": "delivery_date",
    "ship_to_override": "ship_to_override",
}

DEFAULT_REQUIRED_FIELDS = [
    "document_number",
    "customer_name",
    "supplier_name",
    "items.*.material_code",
    "items.*.quantity",
    "items.*.customer_uom",
]

REQUIREMENT_LEVELS = {"MANDATORY", "OPTIONAL", "CONDITIONAL"}


def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_source_format(value: str | None) -> str | None:
    text = _safe_text(value).upper()
    if not text:
        return None
    if text in {"APPLICATION/PDF", "PDF"}:
        return "PDF"
    if text in {"TEXT/CSV", "CSV"}:
        return "CSV"
    if text in {"APPLICATION/VND.MS-EXCEL", "XLS", "XLSX", "EXCEL", "SPREADSHEET"}:
        return "EXCEL"
    if text in {"TEXT/HTML", "HTML"}:
        return "HTML"
    if text in {"TEXT/XML", "APPLICATION/XML", "XML"}:
        return "XML"
    if text in {"TEXT/PLAIN", "EDI", "EDIFACT"}:
        return "EDIFACT"
    if text in {"X12", "ANSI X12"}:
        return "X12"
    if text in {"WORD", "DOC", "DOCX"}:
        return "WORD"
    if text.startswith("IMAGE/"):
        return "IMAGE"
    return text


def _normalize_header_field(field: str) -> str:
    return HEADER_ALIASES.get(_safe_text(field).lower(), _safe_text(field))


def _normalize_item_field(field: str) -> str:
    return ITEM_ALIASES.get(_safe_text(field).lower(), _safe_text(field))


def _normalize_required_field_key(field: str) -> str:
    raw = _safe_text(field)
    if not raw:
        return ""

    if raw.startswith("items."):
        parts = raw.split(".")
        if len(parts) >= 3:
            index = "*" if parts[1] in {"*", "[]", "line", "item"} or not parts[1].isdigit() else parts[1]
            return f"items.{index}.{_normalize_item_field(parts[2])}"
        return raw

    normalized = _normalize_header_field(raw)
    if normalized in ITEM_ALIASES.values():
        return f"items.*.{normalized}"
    return normalized


def _extract_value(mapping_resolution_json: dict[str, Any] | None, key: str, fallback: Any = None) -> Any:
    mapping_resolution_json = mapping_resolution_json or {}
    entry = mapping_resolution_json.get(key)
    if isinstance(entry, dict):
        value = entry.get("value")
        if value not in [None, ""]:
            return value
    return fallback


def _is_present(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return True


def _normalize_requirement_level(value: Any, *, default: str = "MANDATORY") -> str:
    level = _safe_text(value).upper() or default
    return level if level in REQUIREMENT_LEVELS else default


def _make_requirement(field: str, *, level: str = "MANDATORY", when: dict[str, Any] | None = None, source: str | None = None, message: str | None = None) -> dict[str, Any] | None:
    normalized_field = _normalize_required_field_key(field)
    if not normalized_field:
        return None
    requirement: dict[str, Any] = {
        "field": normalized_field,
        "level": _normalize_requirement_level(level),
        "source": source or "CONFIG",
    }
    if isinstance(when, dict) and when:
        requirement["when"] = when
    if _safe_text(message):
        requirement["message"] = _safe_text(message)
    return requirement


def _append_requirement(target: list[dict[str, Any]], requirement: dict[str, Any] | None):
    if requirement:
        target.append(requirement)


def _field_requirements_from_dict(field_requirements: dict[str, Any], *, source: str, default_level: str = "MANDATORY", default_when: dict[str, Any] | None = None):
    results: list[dict[str, Any]] = []
    for field, config in (field_requirements or {}).items():
        if isinstance(config, str):
            _append_requirement(results, _make_requirement(field, level=config, when=default_when, source=source))
        elif isinstance(config, dict):
            _append_requirement(
                results,
                _make_requirement(
                    field,
                    level=config.get("level") or default_level,
                    when=config.get("when") or default_when,
                    source=source,
                    message=config.get("message") or config.get("error_message"),
                ),
            )
        elif isinstance(config, bool):
            _append_requirement(results, _make_requirement(field, level=("MANDATORY" if config else "OPTIONAL"), when=default_when, source=source))
        else:
            _append_requirement(results, _make_requirement(field, level=default_level, when=default_when, source=source))
    return results


def _field_requirements_from_list(entries: list[Any], *, source: str, default_level: str = "MANDATORY", default_when: dict[str, Any] | None = None):
    results: list[dict[str, Any]] = []
    for entry in entries or []:
        if isinstance(entry, str):
            _append_requirement(results, _make_requirement(entry, level=default_level, when=default_when, source=source))
        elif isinstance(entry, dict):
            field = entry.get("field") or entry.get("key") or entry.get("name")
            if not field:
                continue
            _append_requirement(
                results,
                _make_requirement(
                    field,
                    level=entry.get("level") or default_level,
                    when=entry.get("when") or default_when,
                    source=source,
                    message=entry.get("message") or entry.get("error_message"),
                ),
            )
    return results


def _extract_mapping_validation_requirements(validation_json: dict[str, Any] | None) -> list[dict[str, Any]]:
    validation_json = validation_json or {}
    results: list[dict[str, Any]] = []

    _append_all = results.extend
    _append_all(_field_requirements_from_list(validation_json.get("required_fields") or [], source="MAPPING_PROFILE", default_level="MANDATORY"))
    _append_all(_field_requirements_from_list(validation_json.get("mandatory_fields") or [], source="MAPPING_PROFILE", default_level="MANDATORY"))
    _append_all(_field_requirements_from_list(validation_json.get("optional_fields") or [], source="MAPPING_PROFILE", default_level="OPTIONAL"))
    _append_all(_field_requirements_from_dict(validation_json.get("field_requirements") or {}, source="MAPPING_PROFILE"))

    conditional_fields = validation_json.get("conditional_fields") or []
    if isinstance(conditional_fields, dict):
        _append_all(_field_requirements_from_dict(conditional_fields, source="MAPPING_PROFILE", default_level="CONDITIONAL"))
    else:
        _append_all(_field_requirements_from_list(conditional_fields, source="MAPPING_PROFILE", default_level="CONDITIONAL"))

    return results


def _extract_required_field_candidates(payload: Any, *, item_prefix: bool = False) -> list[dict[str, Any]]:
    required: list[dict[str, Any]] = []

    if isinstance(payload, dict):
        for key, value in payload.items():
            low_key = _safe_text(key).lower()
            if low_key in {"required_fields", "required_field_keys", "mandatory_fields", "header_required_fields", "item_required_fields", "missing_fields_blockers", "required", "mandatory"}:
                if isinstance(value, list):
                    for entry in value:
                        normalized = _normalize_required_field_key(str(entry))
                        if item_prefix and normalized and not normalized.startswith("items."):
                            normalized = f"items.*.{_normalize_item_field(normalized)}"
                        _append_requirement(required, _make_requirement(normalized, level="MANDATORY", source="PARSER_PROFILE"))
                elif isinstance(value, str):
                    normalized = _normalize_required_field_key(value)
                    if item_prefix and normalized and not normalized.startswith("items."):
                        normalized = f"items.*.{_normalize_item_field(normalized)}"
                    _append_requirement(required, _make_requirement(normalized, level="MANDATORY", source="PARSER_PROFILE"))
            elif isinstance(value, (dict, list)):
                required.extend(
                    _extract_required_field_candidates(
                        value,
                        item_prefix=item_prefix or low_key in {"items", "item", "lines", "line_items"},
                    )
                )

    elif isinstance(payload, list):
        for entry in payload:
            required.extend(_extract_required_field_candidates(entry, item_prefix=item_prefix))

    return required


def _match_partner(db: Session, client_id: str, sender_name: str | None, receiver_name: str | None):
    candidates = [
        _safe_text(sender_name).lower(),
        _safe_text(receiver_name).lower(),
    ]
    candidates = [c for c in candidates if c]
    if not candidates:
        return None

    partners = (
        db.query(models.TradingPartner)
        .filter(models.TradingPartner.client_id == client_id)
        .filter(models.TradingPartner.status == "ACTIVE")
        .all()
    )

    for candidate in candidates:
        for partner in partners:
            names = {
                _safe_text(getattr(partner, "partner_name", None)).lower(),
                _safe_text(getattr(partner, "partner_code", None)).lower(),
                _safe_text(getattr(partner, "email", None)).lower(),
            }
            if candidate and candidate in names:
                return partner

    for candidate in candidates:
        for partner in partners:
            partner_name = _safe_text(getattr(partner, "partner_name", None)).lower()
            if candidate and partner_name and (candidate in partner_name or partner_name in candidate):
                return partner

    return None


def resolve_partner_processing_setup(
    db: Session,
    *,
    client_id: str,
    sender_name: str | None,
    receiver_name: str | None,
    document_type: str | None,
    source_format: str | None,
) -> dict[str, Any]:
    partner = _match_partner(db, client_id, sender_name, receiver_name)
    profile = None
    flow = None
    parser_profile = None
    mapping_profile = None
    business_rules: list[Any] = []

    normalized_source_format = _normalize_source_format(source_format)
    normalized_document_type = _safe_text(document_type).upper() or "PO"

    if partner is not None:
        profile = (
            db.query(models.TradingPartnerProfile)
            .filter(models.TradingPartnerProfile.partner_id == partner.partner_id)
            .filter(models.TradingPartnerProfile.profile_status == "ACTIVE")
            .order_by(models.TradingPartnerProfile.updated_at.desc())
            .first()
        )

        flow_query = (
            db.query(models.MessageFlow)
            .filter(models.MessageFlow.partner_id == partner.partner_id)
            .filter(models.MessageFlow.is_active == True)
            .filter(models.MessageFlow.document_type == normalized_document_type)
            .filter(models.MessageFlow.message_direction.in_(["INBOUND", "BOTH", None]))
        )

        flows = flow_query.order_by(models.MessageFlow.priority.asc(), models.MessageFlow.flow_name.asc()).all()
        if normalized_source_format:
            flow = next(
                (
                    candidate
                    for candidate in flows
                    if _normalize_source_format(getattr(candidate, "source_format", None)) in {normalized_source_format, None, "UNKNOWN", ""}
                ),
                None,
            )
        if flow is None and flows:
            flow = flows[0]

        if flow and getattr(flow, "parser_profile_id", None):
            parser_profile = (
                db.query(models.ParserProfile)
                .filter(models.ParserProfile.parser_profile_id == flow.parser_profile_id)
                .first()
            )
        if parser_profile is None:
            parser_rows = (
                db.query(models.ParserProfile)
                .filter(models.ParserProfile.partner_id == partner.partner_id)
                .filter(models.ParserProfile.is_active == True)
                .order_by(models.ParserProfile.priority.asc())
                .all()
            )
            if normalized_source_format:
                parser_profile = next(
                    (
                        candidate
                        for candidate in parser_rows
                        if _normalize_source_format(getattr(candidate, "source_format", None)) in {normalized_source_format, None, "", "UNKNOWN"}
                    ),
                    None,
                )
            if parser_profile is None and parser_rows:
                parser_profile = parser_rows[0]

        mapping_profile_id = getattr(flow, "mapping_profile_id", None) if flow is not None else None
        if mapping_profile_id:
            mapping_profile = (
                db.query(models.MappingProfile)
                .filter(models.MappingProfile.mapping_profile_id == mapping_profile_id)
                .first()
            )
        if mapping_profile is None and hasattr(models, "MappingProfile"):
            mapping_rows = (
                db.query(models.MappingProfile)
                .filter(models.MappingProfile.partner_id == partner.partner_id)
                .filter(models.MappingProfile.is_active == True)
                .order_by(models.MappingProfile.priority.asc(), models.MappingProfile.updated_at.desc())
                .all()
            )
            if normalized_source_format:
                mapping_profile = next(
                    (
                        candidate
                        for candidate in mapping_rows
                        if _normalize_source_format(getattr(candidate, "input_format", None)) in {normalized_source_format, None, "", "UNKNOWN"}
                        and _safe_text(getattr(candidate, "document_type", None)).upper() in {normalized_document_type, "", "PO"}
                    ),
                    None,
                )
            if mapping_profile is None and mapping_rows:
                mapping_profile = mapping_rows[0]

        business_rule_model = getattr(models, "TradingPartnerBusinessRule", None)
        if business_rule_model is not None:
            business_rules = (
                db.query(business_rule_model)
                .filter(business_rule_model.partner_id == partner.partner_id)
                .filter(business_rule_model.is_active == True)
                .filter(business_rule_model.rule_type == "VALIDATION")
                .order_by(business_rule_model.priority.asc(), business_rule_model.created_at.asc())
                .all()
            )
            business_rules = [
                rule
                for rule in business_rules
                if _safe_text(getattr(rule, "document_type", None)).upper() in {"", normalized_document_type}
                and _safe_text(getattr(rule, "message_direction", None)).upper() in {"", "INBOUND", "BOTH"}
            ]

    return {
        "partner": partner,
        "partner_profile": profile,
        "flow": flow,
        "parser_profile": parser_profile,
        "mapping_profile": mapping_profile,
        "business_rules": business_rules,
        "source_format": normalized_source_format,
        "document_type": normalized_document_type,
    }


def _lookup_field_value(field: str, mapping_resolution_json: dict[str, Any], header: dict[str, Any], items: list[dict[str, Any]]):
    key = _normalize_required_field_key(field)
    if key.startswith("items.*."):
        item_field = key.split(".", 2)[2]
        values = []
        for index, item in enumerate(items):
            value = _extract_value(mapping_resolution_json, f"items.{index}.{item_field}", item.get(item_field))
            if item_field == "customer_uom":
                value = value or _extract_value(mapping_resolution_json, f"items.{index}.uom", item.get("uom"))
            elif item_field == "material_code":
                value = value or _extract_value(mapping_resolution_json, f"items.{index}.mapped_product", item.get("mapped_product")) or item.get("description")
            elif item_field == "quantity":
                value = value or _extract_value(mapping_resolution_json, f"items.{index}.mapped_quantity", item.get("mapped_quantity"))
            values.append(value)
        return values

    header_key = _normalize_header_field(key)
    value = _extract_value(mapping_resolution_json, header_key, header.get(header_key))
    if header_key == "document_number":
        value = value or header.get("po_number") or header.get("document_number")
    elif header_key == "document_date":
        value = value or header.get("po_date") or header.get("document_date")
    elif header_key == "currency_code":
        value = value or header.get("currency") or header.get("currency_code")
    elif header_key == "ship_to_code":
        value = value or header.get("ship_to") or header.get("ship_to_code")
    return value


def _evaluate_condition(condition: dict[str, Any] | None, mapping_resolution_json: dict[str, Any], header: dict[str, Any], items: list[dict[str, Any]]):
    if not isinstance(condition, dict) or not condition:
        return True

    conditions = condition.get("all") or condition.get("conditions")
    if isinstance(conditions, list) and conditions:
        return all(_evaluate_condition(entry, mapping_resolution_json, header, items) for entry in conditions)

    any_conditions = condition.get("any")
    if isinstance(any_conditions, list) and any_conditions:
        return any(_evaluate_condition(entry, mapping_resolution_json, header, items) for entry in any_conditions)

    field = condition.get("field") or condition.get("key")
    operator = _safe_text(condition.get("operator") or condition.get("op") or "eq").lower()
    expected = condition.get("value")
    actual = _lookup_field_value(_safe_text(field), mapping_resolution_json, header, items)

    actual_values = actual if isinstance(actual, list) else [actual]
    actual_values = [value for value in actual_values if value not in [None, ""]]

    if operator in {"exists", "present", "not_blank"}:
        return any(_is_present(value) for value in actual_values)
    if operator in {"missing", "blank", "not_present"}:
        return not any(_is_present(value) for value in actual_values)

    expected_values = expected if isinstance(expected, list) else [expected]
    expected_texts = {_safe_text(value).lower() for value in expected_values if _safe_text(value)}
    actual_texts = {_safe_text(value).lower() for value in actual_values if _safe_text(value)}

    if operator in {"eq", "="}:
        return bool(actual_texts & expected_texts)
    if operator in {"neq", "!="}:
        return not bool(actual_texts & expected_texts)
    if operator == "contains":
        return any(expected_text in actual_text for actual_text in actual_texts for expected_text in expected_texts)
    if operator == "in":
        return bool(actual_texts & expected_texts)
    if operator == "not_in":
        return not bool(actual_texts & expected_texts)

    return False


def _extract_business_rule_requirements(rule: Any) -> list[dict[str, Any]]:
    action_json = getattr(rule, "action_json", None) or {}
    condition_json = getattr(rule, "condition_json", None) or {}
    source = f"BUSINESS_RULE:{_safe_text(getattr(rule, 'rule_name', None)) or getattr(rule, 'rule_id', None)}"
    default_message = action_json.get("error_message") or action_json.get("message") or getattr(rule, "rule_name", None)
    results: list[dict[str, Any]] = []

    results.extend(_field_requirements_from_list(action_json.get("required_fields") or [], source=source, default_level="MANDATORY"))
    results.extend(_field_requirements_from_list(action_json.get("mandatory_fields") or [], source=source, default_level="MANDATORY"))
    results.extend(_field_requirements_from_list(action_json.get("optional_fields") or [], source=source, default_level="OPTIONAL"))
    results.extend(_field_requirements_from_dict(action_json.get("field_requirements") or {}, source=source, default_when=condition_json if condition_json else None))

    conditional_fields = action_json.get("conditional_fields") or []
    if isinstance(conditional_fields, dict):
        results.extend(_field_requirements_from_dict(conditional_fields, source=source, default_level="CONDITIONAL", default_when=condition_json if condition_json else None))
    else:
        results.extend(_field_requirements_from_list(conditional_fields, source=source, default_level="CONDITIONAL", default_when=condition_json if condition_json else None))

    normalized_results: list[dict[str, Any]] = []
    for requirement in results:
        if default_message and not requirement.get("message"):
            requirement["message"] = default_message
        normalized_results.append(requirement)
    return normalized_results

def _extract_vendor_learning_requirements(learned_mapping_json: dict[str, Any] | None) -> list[dict[str, Any]]:
    learned_mapping_json = learned_mapping_json or {}
    results: list[dict[str, Any]] = []

    validation_json = learned_mapping_json.get("validation") or {}
    if isinstance(validation_json, dict):
        results.extend(_extract_mapping_validation_requirements(validation_json))

    mappings = learned_mapping_json.get("mappings") or []
    if isinstance(mappings, list):
        results.extend(_extract_required_field_candidates(mappings))

    results.extend(_extract_required_field_candidates(learned_mapping_json.get("required_fields") or []))
    results.extend(_extract_required_field_candidates(learned_mapping_json.get("mandatory_fields") or []))
    return results


def _dedupe_requirements(requirements: list[dict[str, Any]]):
    seen: set[tuple[str, str, str]] = set()
    normalized: list[dict[str, Any]] = []
    for requirement in requirements:
        field = _safe_text(requirement.get("field"))
        level = _normalize_requirement_level(requirement.get("level"))
        when_key = str(requirement.get("when") or "")
        key = (field, level, when_key)
        if not field or key in seen:
            continue
        seen.add(key)
        normalized.append(requirement)
    return normalized


def get_required_processing_fields(
    db: Session,
    *,
    client_id: str,
    sender_name: str | None,
    receiver_name: str | None,
    document_type: str | None,
    source_format: str | None,
) -> dict[str, Any]:
    setup = resolve_partner_processing_setup(
        db,
        client_id=client_id,
        sender_name=sender_name,
        receiver_name=receiver_name,
        document_type=document_type,
        source_format=source_format,
    )

    parser_profile = setup.get("parser_profile")
    mapping_profile = setup.get("mapping_profile")
    partner_profile = setup.get("partner_profile")
    flow = setup.get("flow")
    partner = setup.get("partner")
    business_rules = setup.get("business_rules") or []

    learning_party = vendor_learning_service.build_learning_party_key(sender_name, receiver_name)
    learning_rows = []
    if learning_party:
        learning_rows = (
            db.query(models.VendorLayoutLearning)
            .filter(models.VendorLayoutLearning.client_id == client_id)
            .filter(models.VendorLayoutLearning.supplier_name == learning_party)
            .filter(models.VendorLayoutLearning.is_active == True)
            .all()
        )

    formal_setup = any([parser_profile, mapping_profile, partner_profile, flow, business_rules])
    has_setup = bool(formal_setup or learning_rows)
    requirements: list[dict[str, Any]] = []

    if parser_profile is not None:
        requirements.extend(_extract_required_field_candidates(getattr(parser_profile, "parser_config_json", None) or {}))
        requirements.extend(_extract_required_field_candidates(getattr(parser_profile, "field_mapping_json", None) or {}))

    if mapping_profile is not None:
        requirements.extend(_extract_required_field_candidates(getattr(mapping_profile, "mapping_json", None) or {}))
        requirements.extend(_extract_mapping_validation_requirements(getattr(mapping_profile, "validation_json", None) or {}))

    if partner_profile is not None:
        if _safe_text(getattr(partner_profile, "po_date_source", None)).upper() == "PO_DATE":
            _append_requirement(requirements, _make_requirement("document_date", level="MANDATORY", source="PARTNER_PROFILE"))
        if _safe_text(getattr(partner_profile, "delivery_date_source", None)).upper() == "PO_DELIVERY_DATE":
            _append_requirement(requirements, _make_requirement("items.*.delivery_date", level="MANDATORY", source="PARTNER_PROFILE"))

    for rule in business_rules:
        requirements.extend(_extract_business_rule_requirements(rule))

    for learned_row in learning_rows:
        requirements.extend(_extract_vendor_learning_requirements(getattr(learned_row, "learned_mapping_json", None) or {}))

    if not requirements and has_setup:
        requirements = [_make_requirement(field, level="MANDATORY", source="DEFAULT") for field in DEFAULT_REQUIRED_FIELDS]

    requirements = _dedupe_requirements(requirements)

    return {
        "requirements": requirements,
        "required_fields": [req["field"] for req in requirements if req.get("level") != "OPTIONAL"],
        "setup": setup,
        "has_setup": has_setup,
    }


def evaluate_required_processing_fields(
    db: Session,
    *,
    client_id: str,
    sender_name: str | None,
    receiver_name: str | None,
    document_type: str | None,
    source_format: str | None,
    mapping_resolution_json: dict[str, Any] | None,
    header: dict[str, Any] | None,
    items: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    requirement_info = get_required_processing_fields(
        db,
        client_id=client_id,
        sender_name=sender_name,
        receiver_name=receiver_name,
        document_type=document_type,
        source_format=source_format,
    )
    setup = requirement_info.get("setup") or {}
    configured_requirements = list(requirement_info.get("requirements") or [])

    mapping_resolution_json = mapping_resolution_json or {}
    header = header or {}
    items = items or []

    active_requirements: list[dict[str, Any]] = []
    missing_fields: list[str] = []
    missing_messages: list[str] = []

    for requirement in configured_requirements:
        level = _normalize_requirement_level(requirement.get("level"))
        if level == "OPTIONAL":
            continue

        when = requirement.get("when") if isinstance(requirement.get("when"), dict) else None
        if level == "CONDITIONAL" and when and not _evaluate_condition(when, mapping_resolution_json, header, items):
            continue

        field = requirement.get("field")
        if not field:
            continue

        active_requirements.append(requirement)

        if field.startswith("items.*."):
            item_field = field.split(".", 2)[2]
            if not items:
                missing_fields.append(f"items.0.{item_field}")
                continue

            for index, item in enumerate(items):
                value = _lookup_field_value(f"items.*.{item_field}", mapping_resolution_json, header, [item])
                item_value = value[0] if isinstance(value, list) and value else None
                if not _is_present(item_value):
                    missing_fields.append(f"items.{index}.{item_field}")
        else:
            header_value = _lookup_field_value(field, mapping_resolution_json, header, items)
            if not _is_present(header_value):
                missing_fields.append(field)

        if missing_fields and requirement.get("message"):
            missing_messages.append(_safe_text(requirement.get("message")))

    missing_display: list[str] = []
    seen_missing: set[str] = set()
    for key in missing_fields:
        if key not in seen_missing:
            seen_missing.add(key)
            missing_display.append(key)

    allow_partial_processing = bool(getattr(setup.get("flow"), "allow_partial_processing", False))
    formal_setup = bool(setup.get("partner_profile") or setup.get("flow") or setup.get("parser_profile") or setup.get("mapping_profile") or setup.get("business_rules"))
    has_setup = bool(requirement_info.get("has_setup"))

    auto_process_ready = False
    if has_setup:
        auto_process_ready = len(missing_display) == 0 or (allow_partial_processing and formal_setup)

    if missing_display:
        processing_block_reason = "Automatic processing was blocked because required partner validation fields are missing: " + ", ".join(missing_display)
    elif not has_setup:
        processing_block_reason = "No trading partner setup found. This first PO is held in NEW for manual review and learning."
    else:
        processing_block_reason = None

    if missing_messages:
        unique_messages = []
        seen_messages: set[str] = set()
        for message in missing_messages:
            if message and message not in seen_messages:
                seen_messages.add(message)
                unique_messages.append(message)
        if unique_messages:
            processing_block_reason = (processing_block_reason + " " if processing_block_reason else "") + " ".join(unique_messages)

    return {
        "requirements": configured_requirements,
        "active_requirements": active_requirements,
        "required_fields": [req.get("field") for req in active_requirements],
        "missing_required_fields": missing_display,
        "auto_process_ready": auto_process_ready,
        "processing_block_reason": processing_block_reason,
        "partner_id": str(getattr(setup.get("partner"), "partner_id", "") or "") or None,
        "partner_name": getattr(setup.get("partner"), "partner_name", None),
        "flow_name": getattr(setup.get("flow"), "flow_name", None),
        "allow_partial_processing": allow_partial_processing,
        "source_format": setup.get("source_format"),
        "document_type": setup.get("document_type"),
        "has_setup": bool(setup.get("partner") or setup.get("partner_profile") or setup.get("flow") or setup.get("parser_profile") or setup.get("mapping_profile") or setup.get("business_rules")),
    }
