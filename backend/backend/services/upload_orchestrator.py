from __future__ import annotations

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
        return float(val)
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
):
    parsed_data = parsed_data or {}
    raw_header = parsed_data.get("header", {}) or {}
    raw_items = parsed_data.get("items", []) or []
    raw_text = parsed_data.get("raw_text") or ""

    source_format = _detect_source_format(parsed_data, raw_text)
    document_type = _detect_document_type(parsed_data, raw_header)
    
    # STEP 1: detect language
    detected_language = detect_language_code(
        raw_text=raw_text,
        sender=header.get("customer_name") or sender,
    )

    # STEP 2: attach to header (optional)
    header["language_code"] = detected_language

    # STEP 3: prepare mapping resolution JSON
    mapping_resolution_json = parsed_data.get("mapping_resolution_json") or {}

    mapping_resolution_json["language_code"] = {
        "value": detected_language,
        "text": detected_language,
        "source": "AUTO_DETECTED",
        "confidence": 0.95,
    }

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
    header = {
        "document_number": raw_header.get("po_number") or raw_header.get("document_number"),
        "document_date": _normalize_date(
            raw_header.get("po_date") or raw_header.get("document_date")
        ),
        "customer_name": customer_name,
        "supplier_name": supplier_name,
        "currency": raw_header.get("currency"),
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
        sender=header.get("customer_name") or sender,
    )

    header["language_code"] = detected_language

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
            "uom": _safe_str(item.get("uom")) or runtime_cfg.get("uom_default", "EA"),
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
    # REASONS
    # -----------------------------------
    all_reasons = (
        (auto_result.get("reasons") or [])
        + (orchestrator_result.get("reasons") or [])
    )

    # -----------------------------------
    # CREATE DOCUMENT RECORD
    # -----------------------------------
    document_number = header.get("document_number")

    po = models.PurchaseOrder(
        client_id=client_id,
        file_id=file_id,

        po_number=document_number,
        original_po_number=document_number,
        docnum=document_number,

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
        processed_at=now,

        status="NEW",
        mappings_json=final_mappings or None,
        source_type=source_type,
        po_confidence=(
            "HIGH" if confidence_score >= 90
            else "MEDIUM" if confidence_score >= 70
            else "LOW"
        ),
        po_validation_reason=(
            "; ".join(all_reasons)[:2000]
            if all_reasons
            else header.get("validation_reason")
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