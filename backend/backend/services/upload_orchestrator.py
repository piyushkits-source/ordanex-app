from __future__ import annotations

import re
from datetime import datetime, date
from sqlalchemy.orm import Session, joinedload

from backend.db import models
from backend.services.config_loader import (
    get_business_rules,
    get_item_mapping_config,
    get_uom_rules,
)
from backend.services.item_mapping_service import build_runtime_config_from_db
from backend.services.processing_orchestrator import process_document
from backend.services.auto_detection_service import auto_detection_service
from backend.services.po_requirement_service import evaluate_required_processing_fields
from backend.services.idoc_number_service import generate_enterprise_docnum

try:
    from backend.services.rules_engine import apply_business_rules, apply_uom_rules
except Exception:
    def apply_business_rules(items, header, business_rules):
        return items, header

    def apply_uom_rules(items, header, uom_rules):
        return items


def _safe_str(val):
    return "" if val is None else str(val).strip()


def _safe_float(val, default=0.0):
    try:
        if val in [None, ""]:
            return default
        sval = str(val).strip().replace(" ", "")
        if "," in sval and "." not in sval:
            sval = sval.replace(",", ".")
        elif "," in sval and "." in sval:
            sval = sval.replace(",", "")
        return float(sval)
    except Exception:
        return default


def _normalize_date(value):
    if value in [None, ""]:
        return None
    if isinstance(value, date):
        return value
    value = str(value).strip()
    for fmt in ["%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%m/%d/%Y", "%d.%m.%Y"]:
        try:
            return datetime.strptime(value, fmt).date()
        except Exception:
            continue
    return None


_ISO_CURRENCY_CODES = {"USD", "EUR", "GBP", "JPY", "CNY", "CAD", "AUD", "SGD", "HKD", "TWD", "KRW", "INR", "MXN", "CHF"}

_CURRENCY_TOKEN_MAP = {
    "$": "USD",
    "US$": "USD",
    "USD": "USD",
    "DOLLAR": "USD",
    "EUR": "EUR",
    "EURO": "EUR",
    "GBP": "GBP",
    "POUND": "GBP",
    "JPY": "JPY",
    "YEN": "JPY",
    "CNY": "CNY",
    "RMB": "CNY",
    "RENMINBI": "CNY",
    "CAD": "CAD",
    "C$": "CAD",
    "AUD": "AUD",
    "A$": "AUD",
    "SGD": "SGD",
    "HKD": "HKD",
    "NT$": "TWD",
    "TWD": "TWD",
    "KRW": "KRW",
    "INR": "INR",
    "MXN": "MXN",
    "CHF": "CHF",
}


def normalize_currency_code(value: str | None) -> str | None:
    raw = _safe_str(value)
    if not raw:
        return None

    compact = raw.strip()
    upper = compact.upper()
    if upper in _ISO_CURRENCY_CODES:
        return upper

    if "人民币" in compact or "圆" in compact:
        return "CNY"
    if any(ch in compact for ch in ["€"]):
        return "EUR"
    if any(ch in compact for ch in ["£"]):
        return "GBP"
    if any(ch in compact for ch in ["₹"]):
        return "INR"
    if any(ch in compact for ch in ["₩"]):
        return "KRW"
    if "￥" in compact or "¥" in compact or "円" in compact:
        return "JPY"
    if "$" == compact:
        return "USD"

    sanitized = compact.replace("(", " ").replace(")", " ").replace("/", " ").replace("-", " ")
    for token in sanitized.split():
        token_upper = token.upper()
        if token_upper in _CURRENCY_TOKEN_MAP:
            return _CURRENCY_TOKEN_MAP[token_upper]

    symbol_only = "".join(ch for ch in compact if not ch.isalnum() and not ch.isspace())
    if symbol_only in _CURRENCY_TOKEN_MAP:
        return _CURRENCY_TOKEN_MAP[symbol_only]

    return upper if len(upper) == 3 and upper.isalpha() else compact


def detect_language_code(raw_text: str | None, sender: str | None = None) -> str:
    text = raw_text or ""
    sender_text = (sender or "").lower()
    lowered = text.lower()

    if re.search(r"[一-鿿]", text):
        return "ZH"
    if re.search(r"[぀-ヿ]", text):
        return "JA"
    if re.search(r"[가-힯]", text):
        return "KO"

    if "quebec" in sender_text or any(marker in lowered for marker in ["bonjour", "quantite", "quantit", "livraison", "facture", "numero"]):
        return "FR"
    if any(word in lowered for word in ["lieferung", "menge", "rechnung", "bestellung"]):
        return "DE"
    if any(word in lowered for word in ["cantidad", "entrega", "direccion", "factura", "pedido"]):
        return "ES"

    return "EN"


def _normalize_source_format(value: str | None) -> str:
    v = _safe_str(value).lower()

    if v in {"pdf", "application/pdf"}:
        return "PDF"
    if v in {"xlsx", "xls", "excel", "spreadsheet"}:
        return "EXCEL"
    if v in {"csv", "text/csv"}:
        return "CSV"
    if v in {"png", "jpg", "jpeg", "tiff", "bmp", "image"}:
        return "IMAGE"
    if v in {"x12", "ansi x12"}:
        return "X12"
    if v in {"edifact", "edi"}:
        return "EDIFACT"
    if v in {"doc", "docx", "word"}:
        return "WORD"
    if v in {"xml"}:
        return "XML"
    if v in {"json"}:
        return "JSON"

    return "UNKNOWN"


def _detect_source_format(parsed_data: dict, raw_text: str = "") -> str:
    parsed_data = parsed_data or {}

    explicit = (
        parsed_data.get("source_format")
        or parsed_data.get("file_type")
        or parsed_data.get("mime_type")
        or parsed_data.get("format")
    )
    if explicit:
        return _normalize_source_format(explicit)

    rt = _safe_str(raw_text)
    upper_rt = rt.upper()

    if "UNB+" in upper_rt or "UNH+" in upper_rt:
        return "EDIFACT"
    if "ISA*" in upper_rt or "GS*" in upper_rt or "~ST*" in upper_rt:
        return "X12"
    if rt.startswith("{") or rt.startswith("["):
        return "JSON"
    if rt.startswith("<"):
        return "XML"

    return "UNKNOWN"


def _detect_document_type(parsed_data: dict, raw_header: dict) -> str:
    explicit = (
        parsed_data.get("document_type")
        or raw_header.get("document_type")
        or raw_header.get("po_type")
    )

    if explicit:
        return _safe_str(explicit).upper()

    invoice_like = any(
        raw_header.get(field) not in [None, ""]
        for field in (
            "invoice_number",
            "invoice_date",
            "billing_document_number",
            "invoice_total",
            "invoice_amount",
            "reference_po_number",
        )
    ) or any(
        marker in _safe_str(parsed_data.get("raw_text") or raw_header.get("raw_text") or "").lower()
        for marker in ("invoice", "tax invoice", "commercial invoice", "billing invoice")
    )

    if invoice_like:
        return "INVOICE"

    return "PO"


def merge_mappings(learned, auto):
    """
    Priority:
    auto (base) < learned (higher)
    manual corrections are handled later in purchase_order_service updates.
    """
    result = {}

    for m in auto or []:
        if isinstance(m, dict) and m.get("key"):
            result[m["key"]] = m

    for m in learned or []:
        if isinstance(m, dict) and m.get("key"):
            existing = result.get(m["key"], {})
            merged = dict(existing)
            merged.update(m)
            result[m["key"]] = merged

    return list(result.values())

def detect_language_code(raw_text: str | None, sender: str | None = None) -> str:
    text = (raw_text or "").lower()
    sender_text = (sender or "").lower()

    # partner-specific shortcuts first
    if "quebec" in sender_text or "limitée" in text:
        return "FR"

    french_markers = [
        "bonjour", "quantité", "adresse", "livraison", "facture",
        "numéro", "date de livraison", "limitée"
    ]
    german_markers = [
        "lieferung", "menge", "rechnung", "adresse", "bestellung"
    ]
    spanish_markers = [
        "cantidad", "entrega", "dirección", "factura", "pedido"
    ]

    if any(word in text for word in french_markers):
        return "FR"
    if any(word in text for word in german_markers):
        return "DE"
    if any(word in text for word in spanish_markers):
        return "ES"

    return "EN"


def process_parsed_po_upload(
    db: Session,
    client_id: str,
    parsed_data: dict,
    created_by: str = "system",
    environment: str = "PROD",
    file_id: str | None = None,
    inbound_message_id=None,
    split_key=None,
    split_sequence=None,
):
    parsed_data = parsed_data or {}
    raw_header = parsed_data.get("header", {}) or {}
    raw_items = parsed_data.get("items", []) or []
    raw_text = parsed_data.get("raw_text") or ""

    source_format = _detect_source_format(parsed_data, raw_text)
    document_type = _detect_document_type(parsed_data, raw_header)
    
    # STEP 1: prepare mapping resolution JSON
    mapping_resolution_json = parsed_data.get("mapping_resolution_json") or {}

    item_mapping_cfg = get_item_mapping_config(db, client_id)
    business_rules = get_business_rules(db, client_id)
    uom_rules = get_uom_rules(db, client_id)

    # -----------------------------------
    # INBOUND DOCUMENT PARTY SEMANTICS
    # sender   = customer / buyer / partner sending document
    # receiver = supplier / client using Ordanex
    # -----------------------------------
    customer_name = (
        raw_header.get("customer")
        or raw_header.get("customer_name")
        or raw_header.get("buyer")
        or raw_header.get("sender")
    )

    supplier_name = (
        raw_header.get("supplier")
        or raw_header.get("supplier_name")
        or raw_header.get("receiver")
    )

    # -----------------------------------
    # GENERIC DOCUMENT HEADER
    # -----------------------------------
    normalized_currency = normalize_currency_code(raw_header.get("currency") or raw_header.get("currency_code"))

    raw_document_number = raw_header.get("po_number") or raw_header.get("document_number")
    if str(raw_document_number or "").strip().upper() in {"EXCEL_UPLOAD", "CSV_UPLOAD", "TEXT_UPLOAD"}:
        raw_document_number = None

    header = {
        "document_number": raw_document_number,
        "document_date": _normalize_date(
            raw_header.get("po_date") or raw_header.get("document_date")
        ),
        "customer_name": customer_name,
        "supplier_name": supplier_name,
        "currency": normalized_currency,
        "document_type": raw_header.get("po_type") or raw_header.get("document_type"),
        "order_type": raw_header.get("order_type"),
        "sold_to": raw_header.get("sold_to"),
        "ship_to": raw_header.get("ship_to"),
        "confidence": (raw_header.get("po_validation") or {}).get("confidence")
        or raw_header.get("confidence"),
        "validation_reason": (raw_header.get("po_validation") or {}).get("reason")
        or raw_header.get("validation_reason"),
    }

    runtime_cfg = build_runtime_config_from_db(header, {}, item_mapping_cfg)

    detected_language = detect_language_code(
        raw_text=raw_text,
        sender=header.get("customer_name") or customer_name,
    )

    header["language_code"] = detected_language
    mapping_resolution_json["language_code"] = {
        "value": detected_language,
        "text": detected_language,
        "source": "AUTO_DETECTED",
        "confidence": 0.95,
    }

    def _set_mapping_value(key: str, value, source: str = "PARSED"):
        if value in [None, ""]:
            return
        mapping_resolution_json[key] = {
            "value": str(value),
            "text": str(value),
            "source": source,
            "confidence": 0.9,
        }

    _set_mapping_value("document_number", header.get("document_number"))
    _set_mapping_value("po_number", header.get("document_number"))
    _set_mapping_value("document_date", header.get("document_date"))
    _set_mapping_value("po_date", header.get("document_date"))
    _set_mapping_value("customer_name", header.get("customer_name"))
    _set_mapping_value("supplier_name", header.get("supplier_name"))
    _set_mapping_value("currency_code", header.get("currency"))
    _set_mapping_value("document_type", document_type)
    _set_mapping_value("order_type", header.get("order_type"))
    _set_mapping_value("ship_to_code", header.get("ship_to"))

    # -----------------------------------
    # GENERIC MESSAGE FIELDS
    # -----------------------------------
    sender = _safe_str(customer_name) or "Customer"
    receiver = _safe_str(supplier_name) or "Supplier"

    now = datetime.utcnow()

    # -----------------------------------
    # ITEMS NORMALIZATION
    # -----------------------------------
    items = []
    for idx, item in enumerate(raw_items, start=1):
        partner_line_no = item.get("line_no") or item.get("line_number") or idx
        try:
            partner_line_no = int(float(str(partner_line_no).strip()))
        except Exception:
            partner_line_no = idx

        price = (
            item.get("unit_price")
            if item.get("unit_price") is not None
            else item.get("price")
        )

        normalized_item = {
            "line_no": partner_line_no,
            "material_code": _safe_str(item.get("material_code") or item.get("material")),
            "description": _safe_str(item.get("description")),
            "quantity": _safe_float(item.get("quantity"), None),
            "uom": _safe_str(item.get("uom")) or runtime_cfg.get("uom_default"),
            "unit_price": _safe_float(price, None),
            "amount": _safe_float(item.get("amount"), None),
            "delivery_date": _normalize_date(item.get("delivery_date")),
            "plant": _safe_str(item.get("plant")) or runtime_cfg.get("plant"),
            "is_corrected": False,
        }

        if (
            normalized_item["amount"] in [None, ""]
            and normalized_item["quantity"] not in [None, ""]
            and normalized_item["unit_price"] not in [None, ""]
        ):
            try:
                normalized_item["amount"] = round(
                    float(normalized_item["quantity"]) * float(normalized_item["unit_price"]),
                    4,
                )
            except Exception:
                pass

        items.append(normalized_item)

        _set_mapping_value(f"items.{idx - 1}.line_no", normalized_item.get("line_no"))
        _set_mapping_value(f"items.{idx - 1}.material_code", normalized_item.get("material_code"))
        _set_mapping_value(f"items.{idx - 1}.mapped_product", normalized_item.get("material_code"))
        _set_mapping_value(f"items.{idx - 1}.description", normalized_item.get("description"))
        _set_mapping_value(f"items.{idx - 1}.line_details", normalized_item.get("description"))
        _set_mapping_value(f"items.{idx - 1}.quantity", normalized_item.get("quantity"))
        _set_mapping_value(f"items.{idx - 1}.mapped_quantity", normalized_item.get("quantity"))
        _set_mapping_value(f"items.{idx - 1}.customer_uom", normalized_item.get("uom"))
        _set_mapping_value(f"items.{idx - 1}.unit_price", normalized_item.get("unit_price"))
        _set_mapping_value(f"items.{idx - 1}.amount", normalized_item.get("amount"))
        _set_mapping_value(f"items.{idx - 1}.delivery_date", normalized_item.get("delivery_date"))

    # -----------------------------------
    # APPLY RULES
    # -----------------------------------
    items = apply_uom_rules(items, header, uom_rules)
    items, header = apply_business_rules(items, header, business_rules)

    # -----------------------------------
    # AUTO DETECTION
    # -----------------------------------
    auto_result = auto_detection_service.detect_document(
        db,
        client_id=client_id,
        sender_name=header.get("customer_name") or sender,
        document_type=document_type,
        source_format=source_format,
        raw_text=raw_text,
        header=header,
        items=items,
        current_mappings=[],
    )

    auto_mappings = auto_result.get("mappings", []) or []

    # -----------------------------------
    # ORCHESTRATOR / LEARNING-BASED APPLY
    # For inbound documents, the customer/sender usually owns the layout.
    # -----------------------------------
    orchestrator_result = process_document(
        db,
        client_id=client_id,
        supplier_name=header.get("customer_name") or sender,
        header_dict=header,
        items=items,
        raw_text=raw_text,
        source_format=source_format,
        document_type=document_type,
    )

    bbox_map = orchestrator_result.get("bbox_map", {}) or {}

    learned_mappings = [
        {"key": key, "bbox": bbox}
        for key, bbox in bbox_map.items()
        if key and bbox
    ]

    # -----------------------------------
    # FINAL MERGE
    # learned overrides auto for same field keys
    # -----------------------------------
    final_mappings = merge_mappings(
        learned=learned_mappings,
        auto=auto_mappings,
    )

    # -----------------------------------
    # SOURCE TYPE
    # -----------------------------------
    if learned_mappings and auto_mappings:
        source_type = "LEARNED+AI"
    elif learned_mappings:
        source_type = "LEARNED"
    elif auto_mappings:
        source_type = "AI"
    else:
        source_type = "MANUAL"

    # -----------------------------------
    # CONFIDENCE
    # -----------------------------------
    confidence_score = max(
        int(orchestrator_result.get("confidence_score", 0) or 0),
        int((auto_result.get("confidence", 0) or 0) * 100),
    )

    # -----------------------------------
    # REQUIRED FIELD GATE
    # -----------------------------------
    requirement_state = evaluate_required_processing_fields(
        db,
        client_id=client_id,
        sender_name=sender,
        receiver_name=receiver,
        document_type=document_type,
        source_format=source_format,
        mapping_resolution_json=mapping_resolution_json,
        header={
            "document_number": header.get("document_number"),
            "document_date": header.get("document_date"),
            "customer_name": header.get("customer_name"),
            "supplier_name": header.get("supplier_name"),
            "currency_code": header.get("currency"),
            "ship_to_code": header.get("ship_to"),
            "document_type": document_type,
            "order_type": header.get("order_type"),
        },
        items=[
            {
                "line_no": item.get("line_no"),
                "material_code": item.get("material_code"),
                "mapped_product": item.get("material_code"),
                "description": item.get("description"),
                "quantity": item.get("quantity"),
                "mapped_quantity": item.get("quantity"),
                "customer_uom": item.get("uom"),
                "uom": item.get("uom"),
                "delivery_date": item.get("delivery_date"),
            }
            for item in items
        ],
    )
    missing_required_fields = list(requirement_state.get("missing_required_fields") or [])
    auto_process_ready = bool(requirement_state.get("auto_process_ready", len(missing_required_fields) == 0))
    has_setup = bool(requirement_state.get("has_setup", True))

    # -----------------------------------
    # REASONS
    # -----------------------------------
    all_reasons = (
        (auto_result.get("reasons") or [])
        + (orchestrator_result.get("reasons") or [])
    )
    if missing_required_fields:
        all_reasons.append(
            "Missing required fields for automatic processing: " + ", ".join(missing_required_fields)
        )

    # -----------------------------------
    # CREATE DOCUMENT RECORD
    # -----------------------------------
    document_number = header.get("document_number")
    sequence_docnum = generate_enterprise_docnum(db, client_id, sender or receiver or "ORD")

    po = models.PurchaseOrder(
        client_id=client_id,
        file_id=file_id,
        inbound_message_id=inbound_message_id,
        split_key=split_key,
        split_sequence=split_sequence,
        po_number=document_number,
        original_po_number=document_number,
        docnum=sequence_docnum,

        po_date=header.get("document_date"),
        supplier_name=header.get("supplier_name") or receiver,
        currency=header.get("currency"),
        po_type=document_type,
        order_type=header.get("order_type"),
        sold_to=header.get("sold_to"),
        ship_to=header.get("ship_to"),

        sender=sender,
        receiver=receiver,
        direction="INBOUND",
        environment=environment,

        received_at=now,
        processed_at=(now if auto_process_ready else None),
        needs_review=bool(missing_required_fields) or not has_setup,
        review_status=("REQUIRED_FIELDS_MISSING" if missing_required_fields else ("NO_PARTNER_SETUP" if not has_setup else "READY_FOR_AUTO_PROCESS")),

        status=("PENDING" if missing_required_fields else "NEW"),
        mappings_json=final_mappings or None,
        mapping_resolution_json=mapping_resolution_json or None,
        field_boxes_json=bbox_map or None,
        vendor_learning_json=requirement_state or None,
        source_type=source_type,
        po_confidence=(
            "HIGH" if confidence_score >= 90
            else "MEDIUM" if confidence_score >= 70
            else "LOW"
        ),
        po_validation_reason=(
            "; ".join(all_reasons)[:2000]
            if all_reasons
            else header.get("validation_reason") or requirement_state.get("processing_block_reason")
        ),

        total_items=len(items),
        retry_count=0,
        created_by=created_by,
        raw_text=raw_text,
    )

    db.add(po)
    db.flush()

    # -----------------------------------
    # CREATE ITEM RECORDS
    # -----------------------------------
    for item in items:
        db.add(models.PurchaseOrderItem(po_id=po.po_id, **item))

    # -----------------------------------
    # OPTIONAL LOG
    # -----------------------------------
    if hasattr(models, "PoLog"):
        mapping_note = ""
        if learned_mappings and auto_mappings:
            mapping_note = " (learned + AI mappings applied)"
        elif learned_mappings:
            mapping_note = " (vendor learning auto-applied)"
        elif auto_mappings:
            mapping_note = " (AI auto-detection applied)"

        db.add(
            models.PoLog(
                po_id=po.po_id,
                client_id=client_id,
                level="INFO",
                stage="UPLOAD",
                message="Document parsed and created successfully" + mapping_note,
                error_type="UPLOAD_SUCCESS",
                created_by=created_by,
            )
        )

    db.commit()

    po = (
        db.query(models.PurchaseOrder)
        .options(joinedload(models.PurchaseOrder.items))
        .filter(models.PurchaseOrder.po_id == po.po_id)
        .first()
    )

    return po

