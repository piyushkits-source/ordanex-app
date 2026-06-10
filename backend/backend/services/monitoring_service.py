from __future__ import annotations

import json
from typing import Any
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
import csv
import io

from backend.db import models


class MonitoringService:
    def _normalize_direction(self, value: Any) -> str | None:
        direction = str(value or "").strip().upper()
        if direction in {"INBOUND", "OUTBOUND"}:
            return direction
        return None

    def _infer_payload_direction(self, row: Any) -> str | None:
        payload = str(
            getattr(row, "xml_payload", None)
            or getattr(row, "raw_text", None)
            or ""
        ).upper()
        if not payload:
            return None
        if "<DIRECT>1</DIRECT>" in payload or "DIRECT>1" in payload or "DIRECT=1" in payload:
            return "OUTBOUND"
        if "<DIRECT>2</DIRECT>" in payload or "DIRECT>2" in payload or "DIRECT=2" in payload:
            return "INBOUND"
        return None

    def _infer_transport_direction(self, row: Any) -> str:
        explicit = self._normalize_direction(
            getattr(row, "transport_direction", None)
            or getattr(row, "channel_direction", None)
            or getattr(row, "source_direction", None)
        )
        if explicit:
            return explicit

        source_channel = str(
            getattr(row, "source_channel", None)
            or getattr(row, "source_type", None)
            or ""
        ).strip().upper()
        if source_channel in {"EMAIL", "API", "SFTP", "AS2", "EDI", "FTP", "UPLOAD"}:
            return "INBOUND"
        if source_channel in {"OUTBOUND", "DELIVERY", "DISPATCH"}:
            return "OUTBOUND"

        transport_markers = (
            getattr(row, "inbound_message_id", None),
            getattr(row, "received_at", None),
        )
        if any(marker not in [None, ""] for marker in transport_markers):
            return "INBOUND"

        outbound_markers = (
            getattr(row, "outbound_message_id", None),
            getattr(row, "delivered_at", None),
        )
        if any(marker not in [None, ""] for marker in outbound_markers):
            return "OUTBOUND"

        return "INBOUND"

    def _looks_like_invoice(self, row: Any) -> bool:
        invoice_fields = (
            "invoice_number",
            "billing_document_number",
            "invoice_total",
            "invoice_date",
            "due_date",
            "payment_terms",
            "tax_total",
            "freight_total",
            "receipt_number",
            "receipt_total",
        )
        for field in invoice_fields:
            value = getattr(row, field, None)
            if value not in [None, ""]:
                return True
        return False

    def _has_outbound_message(self, db: Session, row: Any) -> bool:
        po_id = getattr(row, "po_id", None)
        if not po_id:
            return False
        outbound = (
            db.query(models.OutboundMessage)
            .filter(models.OutboundMessage.po_id == po_id)
            .filter(models.OutboundMessage.status.in_(["READY", "SENT", "BLOCKED"]))
            .first()
        )
        return outbound is not None

    def _infer_direction(self, row: Any) -> str:
        explicit = self._normalize_direction(getattr(row, "business_direction", None))
        if explicit in {"INBOUND", "OUTBOUND"}:
            return explicit

        payload_direction = self._infer_payload_direction(row)
        if payload_direction:
            return payload_direction

        outbound_markers = (
            getattr(row, "outbound_message_id", None),
            getattr(row, "delivered_at", None),
            getattr(row, "dispatch_status", None),
            getattr(row, "delivery_status", None),
            getattr(row, "delivery_reference", None),
            getattr(row, "status", None) if str(getattr(row, "status", "") or "").upper() in {"DELIVERY_QUEUED", "DELIVERED", "DELIVERY_FAILED"} else None,
        )
        if any(marker not in [None, ""] for marker in outbound_markers):
            return "OUTBOUND"

        message_family = str(
            getattr(row, "message_family", None)
            or getattr(row, "message_type", None)
            or getattr(row, "po_type", None)
            or getattr(row, "document_type", None)
            or ""
        ).strip().upper()
        if message_family in {"AR_INVOICE", "INVOICE", "ORDRSP", "DESADV"}:
            return "OUTBOUND"
        if message_family in {"AP_INVOICE", "ORDERS", "PO", "ORDER", "ORDER_CHANGE", "ASN"}:
            return "INBOUND"

        inbound_markers = (
            getattr(row, "inbound_message_id", None),
            getattr(row, "received_at", None),
        )
        if any(marker not in [None, ""] for marker in inbound_markers):
            return "INBOUND"

        return "INBOUND"

    def _status_group(self, status: str | None) -> str:
        s = (status or "").strip().upper()

        if s in {"NEW", "PENDING", "ERROR", "FAILED", "CORRECTED"}:
            return "PENDING"

        if s in {"PROCESSING", "REPROCESSING", "TRANSFORMED"}:
            return "IN_PROGRESS"

        if s in {"PROCESSED", "SUCCESS"}:
            return "SUCCESSFUL"

        if s in {"ARCHIVED"}:
            return "ARCHIVE"

        return s or "UNKNOWN"

    def get_queue(
        self,
        db: Session,
        *,
        environment: str,
        direction: str | None = None,
        status_filter: str | None = None,
        client_id: str | None = None,
        po_id: str | None = None,
        search: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> list[dict[str, Any]]:
        query = db.query(models.PurchaseOrder).options(
            joinedload(models.PurchaseOrder.items)
        )

        env = (environment or "").upper()

        if env == "STAGING":
            query = query.filter(
                or_(
                    models.PurchaseOrder.environment == "STAGING",
                    models.PurchaseOrder.environment.is_(None),
                )
            )
        elif env == "PROD":
            query = query.filter(
                or_(
                    models.PurchaseOrder.environment == "PROD",
                    models.PurchaseOrder.environment.is_(None),
                )
            )

        if client_id:
            query = query.filter(models.PurchaseOrder.client_id == client_id)

        if po_id:
            query = query.filter(models.PurchaseOrder.po_id == po_id)

        if search:
            s = f"%{search.lower()}%"
            query = query.filter(
                or_(
                    models.PurchaseOrder.po_number.ilike(s),
                    models.PurchaseOrder.docnum.ilike(s),
                    models.PurchaseOrder.sender.ilike(s),
                    models.PurchaseOrder.receiver.ilike(s),
                    models.PurchaseOrder.supplier_name.ilike(s),
                    models.PurchaseOrder.raw_text.ilike(s),
                )
            )

        if from_date:
            query = query.filter(models.PurchaseOrder.created_at >= from_date)

        if to_date:
            query = query.filter(models.PurchaseOrder.created_at <= to_date)

        rows = query.order_by(models.PurchaseOrder.created_at.desc()).all()
        results = [self._serialize_po(db, r) for r in rows]
        if direction and direction != "ALL":
            results = [
                r for r in results
                if self._normalize_direction(r.get("direction")) == direction
            ]
        print("status_filter received=", status_filter)
        if status_filter and status_filter != "ALL":
            results = [
                r for r in results
                if self._status_group(r.get("status")) == status_filter
            ]
        print("statuses returned =", [r.get("status") for r in results[:10]])
        return results

    def get_activity_logs(self, db: Session, po_id) -> list[dict[str, Any]]:
        rows = (
            db.query(models.PoLog)
            .filter(models.PoLog.po_id == po_id)
            .all()
        )

        results: list[dict[str, Any]] = []

        for idx, r in enumerate(rows, start=1):
            ts = (
                getattr(r, "log_time", None)
                or getattr(r, "created_at", None)
                or getattr(r, "timestamp", None)
                or getattr(r, "logged_at", None)
                or getattr(r, "event_time", None)
                or getattr(r, "updated_at", None)
            )
            timestamp = ts.isoformat() if ts and hasattr(ts, "isoformat") else ""

            results.append(
                {
                    "id": str(getattr(r, "log_id", None) or idx),
                    "log_id": str(getattr(r, "log_id", None) or idx),
                    "po_id": str(po_id),
                    "stage": str(getattr(r, "stage", "") or "ACTIVITY"),
                    "event_type": str(getattr(r, "event_type", "") or getattr(r, "stage", "") or "ACTIVITY"),
                    "level": str(getattr(r, "level", "") or "INFO"),
                    "message": str(getattr(r, "message", "") or ""),
                    "actor_type": None,
                    "actor_email": getattr(r, "created_by", None),
                    "changed_fields": None,
                    "recipients": None,
                    "timestamp": timestamp,
                    "created_at": timestamp,
                }
            )

        if results:
            return results

        po = (
            db.query(models.PurchaseOrder)
            .filter(models.PurchaseOrder.po_id == po_id)
            .first()
        )
        if not po:
            return []

        synthetic: list[dict[str, Any]] = []

        def add_log(log_id: str, stage: str, level: str, message: str, dt) -> None:
            timestamp = dt.isoformat() if dt and hasattr(dt, "isoformat") else ""
            synthetic.append(
                {
                    "id": log_id,
                    "log_id": log_id,
                    "po_id": str(po_id),
                    "stage": stage,
                    "event_type": stage,
                    "level": level,
                    "message": message,
                    "actor_type": "SYSTEM",
                    "actor_email": None,
                    "changed_fields": None,
                    "recipients": None,
                    "timestamp": timestamp,
                    "created_at": timestamp,
                }
            )

        add_log("received", "RECEIVED", "INFO", "Inbound document received by platform.", getattr(po, "received_at", None) or getattr(po, "created_at", None))
        add_log("created", "JOB_CREATED", "INFO", "Processing job created for document.", getattr(po, "created_at", None))

        if getattr(po, "raw_text", None):
            add_log("parsed", "PARSED", "INFO", "Source document text extracted successfully.", getattr(po, "updated_at", None) or getattr(po, "created_at", None))

        if getattr(po, "ship_to", None) or getattr(po, "ship_to_name", None):
            add_log("resolved_ship_to", "ADDRESS_RESOLUTION", "INFO", "Ship-to details resolved from onboarding data.", getattr(po, "updated_at", None) or getattr(po, "created_at", None))

        if getattr(po, "canonical_json", None) or getattr(po, "mapping_resolution_json", None) or getattr(po, "mappings_json", None):
            add_log("mapped", "MAPPING", "INFO", "Extraction and mapping data available.", getattr(po, "updated_at", None) or getattr(po, "created_at", None))

        if getattr(po, "processed_at", None):
            add_log("processed", "PROCESSED", "INFO", "Output payload generated successfully.", getattr(po, "processed_at", None))

        if getattr(po, "delivered_at", None):
            add_log("delivered", "DELIVERED", "INFO", "Payload delivered to target endpoint.", getattr(po, "delivered_at", None))

        return synthetic

    def get_processing_flow(self, db: Session, po_id) -> list[dict[str, Any]]:
        po = (
            db.query(models.PurchaseOrder)
            .filter(models.PurchaseOrder.po_id == po_id)
            .first()
        )

        if not po:
            return []

        flow: list[dict[str, Any]] = []

        if getattr(po, "received_at", None):
            flow.append(
                {
                    "id": "message_received",
                    "name": "Message received",
                    "step_name": "Message received",
                    "stage": "RECEIVED",
                    "status": "DONE",
                    "timestamp": po.received_at.isoformat(),
                    "created_at": po.received_at.isoformat(),
                    "details": "Inbound document received by platform",
                }
            )

        if getattr(po, "created_at", None):
            flow.append(
                {
                    "id": "job_created",
                    "name": "Job created",
                    "step_name": "Job created",
                    "stage": "JOB_CREATED",
                    "status": "DONE",
                    "timestamp": po.created_at.isoformat(),
                    "created_at": po.created_at.isoformat(),
                    "details": "Processing job created for document",
                }
            )

        if (
            getattr(po, "mappings_json", None)
            or getattr(po, "mapping_resolution_json", None)
            or getattr(po, "canonical_json", None)
            or getattr(po, "raw_text", None)
        ):
            updated_at_val = getattr(po, "updated_at", None) or getattr(po, "created_at", None)
            flow.append(
                {
                    "id": "mapping_available",
                    "name": "Extraction / Mapping available",
                    "step_name": "Extraction / Mapping available",
                    "stage": "MAPPING",
                    "status": "DONE",
                    "timestamp": updated_at_val.isoformat() if updated_at_val else None,
                    "created_at": updated_at_val.isoformat() if updated_at_val else None,
                    "details": "Fields extracted and/or user mappings available",
                }
            )

        if getattr(po, "processed_at", None):
            flow.append(
                {
                    "id": "processed_xml_generated",
                    "name": "Processed / XML generated",
                    "step_name": "Processed / XML generated",
                    "stage": "PROCESSED",
                    "status": "DONE",
                    "timestamp": po.processed_at.isoformat(),
                    "created_at": po.processed_at.isoformat(),
                    "details": "Output payload generated successfully",
                }
            )

        elif (
            getattr(po, "xml_payload", None)
            or getattr(po, "target_payload_json", None)
            or str(getattr(po, "status", "") or "").upper() in {"PROCESSED", "SUCCESS"}
        ):
            processed_ts = getattr(po, "updated_at", None) or getattr(po, "created_at", None)
            flow.append(
                {
                    "id": "processed_xml_generated",
                    "name": "Processed / XML generated",
                    "step_name": "Processed / XML generated",
                    "stage": "PROCESSED",
                    "status": "DONE",
                    "timestamp": processed_ts.isoformat() if processed_ts else None,
                    "created_at": processed_ts.isoformat() if processed_ts else None,
                    "details": "Output payload generated successfully",
                }
            )

        if getattr(po, "delivered_at", None):
            flow.append(
                {
                    "id": "delivered",
                    "name": "Delivered",
                    "step_name": "Delivered",
                    "stage": "DELIVERED",
                    "status": "DONE",
                    "timestamp": po.delivered_at.isoformat(),
                    "created_at": po.delivered_at.isoformat(),
                    "details": "Payload delivered to target endpoint",
                }
            )

        if not flow:
            flow.append(
                {
                    "id": "not_started",
                    "name": "Processing not started",
                    "step_name": "Processing not started",
                    "stage": "NOT_STARTED",
                    "status": getattr(po, "status", None) or "UNKNOWN",
                    "timestamp": None,
                    "created_at": None,
                    "details": "No processing milestones available yet",
                }
            )

        return flow

    def export_queue_csv(self, rows: list[dict]) -> str:
        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow(
            [
                "Document Number",
                "Document Date",
                "Customer",
                "Supplier",
                "Status",
                "Items",
                "Created At",
            ]
        )

        for r in rows:
            writer.writerow(
                [
                    r.get("po_number"),
                    r.get("po_date"),
                    r.get("sender"),
                    r.get("receiver"),
                    r.get("status"),
                    len(r.get("items", [])),
                    r.get("created_at"),
                ]
            )

        return output.getvalue()



    def _serialize_po(self, db: Session, row: Any) -> dict[str, Any]:
        def _safe_iso(dt):
            try:
                return dt.isoformat() if dt else None
            except Exception:
                return None

        def _safe_json(value: Any) -> dict[str, Any]:
            if isinstance(value, dict):
                return value
            if isinstance(value, str):
                text = value.strip()
                if text.startswith("{") and text.endswith("}"):
                    try:
                        parsed = json.loads(text)
                        if isinstance(parsed, dict):
                            return parsed
                    except Exception:
                        return {}
            return {}

        def _safe_float(val):
            try:
                return float(val) if val is not None else None
            except Exception:
                return None

        source_items = getattr(row, "items", []) or []

        items = []
        for idx, item in enumerate(source_items):
            line_no = getattr(item, "line_no", None) or (idx + 1)

            items.append(
                {
                    "id": str(getattr(item, "po_item_id", "") or "")
                    if getattr(item, "po_item_id", None)
                    else None,
                    "line_no": line_no,
                    "material_code": getattr(item, "material_code", None),
                    "mapped_product": getattr(item, "material_code", None),
                    "description": getattr(item, "description", None),
                    "line_details": getattr(item, "description", None),
                    "quantity": _safe_float(getattr(item, "quantity", None)),
                    "mapped_quantity": _safe_float(getattr(item, "quantity", None)),
                    "customer_uom": getattr(item, "uom", None),
                    "supplier_uom": None,
                    "supplier_uom_conversion_factor": None,
                    "uom": getattr(item, "uom", None),
                    "unit_price": _safe_float(getattr(item, "unit_price", None)),
                    "amount": _safe_float(getattr(item, "amount", None)),
                    "delivery_date": _safe_iso(getattr(item, "delivery_date", None)),
                    "delivery_time": None,
                    "ship_to_override": None,
                }
            )

        resolution_source = getattr(row, "mapping_resolution_json", None) or {}
        boxes_source = getattr(row, "field_boxes_json", None) or {}

        mapping_full_map: dict[str, dict[str, Any]] = {}

        if isinstance(resolution_source, dict):
            for key, value in resolution_source.items():
                if not key:
                    continue
                if isinstance(value, dict):
                    entry = dict(value)
                else:
                    entry = {"value": value}
                entry["key"] = str(key)
                mapping_full_map[str(key)] = entry

        if isinstance(boxes_source, dict):
            for key, bbox in boxes_source.items():
                if key:
                    existing = mapping_full_map.get(str(key), {"key": str(key)})
                    existing["bbox"] = bbox
                    mapping_full_map[str(key)] = existing

        def mapping_value(key: str, default=None):
            saved = mapping_full_map.get(key) or {}
            value = saved.get("value")
            if value not in [None, ""]:
                return value
            return default

        resolved_document_number = mapping_value(
            "document_number",
            getattr(row, "po_number", None),
        )
        resolved_document_date = mapping_value(
            "document_date",
            _safe_iso(getattr(row, "po_date", None)),
        )
        client_row = db.query(models.Client).filter(models.Client.client_id == getattr(row, "client_id", None)).first()
        def _clean_party_name(value: Any) -> str | None:
            text = str(value or "").strip()
            if not text:
                return None
            upper = text.upper()
            if upper.startswith("PAGE_") or upper.startswith("PAGE ") or upper.startswith("PAGE-"):
                return None
            if "@" in text and "." in text:
                return None
            return text

        resolved_customer_name = mapping_value(
            "customer_name",
            _clean_party_name(getattr(client_row, "client_name", None)) or _clean_party_name(getattr(row, "receiver", None)),
        )
        resolved_supplier_name = mapping_value(
            "supplier_name",
            _clean_party_name(getattr(row, "supplier_name", None))
            or _clean_party_name(getattr(row, "partner_name", None))
            or _clean_party_name(getattr(row, "trading_partner_name", None))
            or _clean_party_name(getattr(row, "sender", None)),
        )
        resolved_document_type = mapping_value(
            "document_type",
            getattr(row, "po_type", None),
        )
        resolved_order_type = mapping_value(
            "order_type",
            getattr(row, "order_type", None),
        )
        resolved_message_family_field = mapping_value(
            "message_family",
            getattr(row, "message_family", None) or getattr(row, "message_type", None) or getattr(row, "po_type", None),
        )
        resolved_message_type_field = mapping_value(
            "message_type",
            getattr(row, "message_type", None) or getattr(row, "message_family", None) or getattr(row, "po_type", None),
        )
        resolved_message_family_field = mapping_value(
            "message_family",
            getattr(row, "message_family", None) or getattr(row, "message_type", None) or getattr(row, "po_type", None),
        )
        resolved_message_type_field = mapping_value(
            "message_type",
            getattr(row, "message_type", None) or getattr(row, "message_family", None) or getattr(row, "po_type", None),
        )
        resolved_language_code = mapping_value("language_code", None)
        resolved_currency_code = mapping_value(
            "currency_code",
            getattr(row, "currency", None),
        )
        resolved_ship_to_code = mapping_value(
            "ship_to_code",
            getattr(row, "ship_to", None),
        )
        resolved_ship_to_name = mapping_value(
            "ship_to_name",
            getattr(row, "ship_to_name", None),
        )
        resolved_ship_to_address = mapping_value(
            "ship_to_address",
            getattr(row, "ship_to_address", None),
        )
        header_details_raw = getattr(row, "header_details", None)
        resolved_header_details = mapping_value("header_details", header_details_raw if isinstance(header_details_raw, str) else None)
        header_details_json = _safe_json(header_details_raw)

        is_invoice = str(getattr(row, "po_type", "") or getattr(row, "order_type", "")).upper() == "INVOICE"
        invoice_like_keys = {
            "invoice_number",
            "invoice_date",
            "invoice_total",
            "invoice_amount",
            "billing_document_number",
            "reference_po_number",
            "payment_terms",
            "due_date",
            "tax_total",
            "freight_total",
            "gross_amount",
            "net_amount",
            "receipt_number",
            "receipt_total",
        }
        show_invoice_fields = is_invoice or any(
            key in header_details_json or key in mapping_full_map
            for key in invoice_like_keys
        )
        show_family_fields = str(
            resolved_message_family_field or resolved_message_type_field or resolved_document_type or ""
        ).upper() in {"INVOICE", "AP_INVOICE", "AR_INVOICE", "ORDER_RESPONSE", "ORDER_CHANGE", "ASN", "ORDRSP", "ORDCHG", "DESADV"}
        show_family_fields = str(
            resolved_message_family_field or resolved_message_type_field or resolved_document_type or ""
        ).upper() in {"INVOICE", "AP_INVOICE", "AR_INVOICE", "ORDER_RESPONSE", "ORDER_CHANGE", "ASN", "ORDRSP", "ORDCHG", "DESADV"}

        default_mappings: list[dict[str, Any]] = [
            {
                "key": "document_number",
                "label": "Document Number",
                "value": str(resolved_document_number or ""),
            },
            {
                "key": "po_number",
                "label": "PO Number",
                "value": str(resolved_document_number or ""),
            },
            {
                "key": "document_date",
                "label": "Document Date",
                "value": str(resolved_document_date or ""),
            },
            {
                "key": "po_date",
                "label": "PO Date",
                "value": str(resolved_document_date or ""),
            },
            {
                "key": "customer_name",
                "label": "Customer",
                "value": str(resolved_customer_name or ""),
            },
            {
                "key": "supplier_name",
                "label": "Supplier",
                "value": str(resolved_supplier_name or ""),
            },
            {
                "key": "document_type",
                "label": "Document Type",
                "value": str(resolved_document_type or ""),
            },
            {
                "key": "message_type",
                "label": "Message Type",
                "value": str(resolved_message_type_field or ""),
            },
            {
                "key": "message_family",
                "label": "Message Family",
                "value": str(resolved_message_family_field or ""),
            },
            {
                "key": "order_type",
                "label": "Order Type",
                "value": str(resolved_order_type or ""),
            },
            {
                "key": "language_code",
                "label": "Language Code",
                "value": str(resolved_language_code or ""),
            },
            {
                "key": "currency_code",
                "label": "Currency Code",
                "value": str(resolved_currency_code or ""),
            },
            {
                "key": "ship_to_code",
                "label": "Ship To ID",
                "value": str(resolved_ship_to_code or ""),
            },
            {
                "key": "ship_to_name",
                "label": "Ship To Name",
                "value": str(resolved_ship_to_name or ""),
            },
            {
                "key": "ship_to_address",
                "label": "Ship To Address",
                "value": str(resolved_ship_to_address or ""),
            },
            {
                "key": "header_details",
                "label": "Header Details",
                "value": str(resolved_header_details or ""),
            },
        ]

        if show_invoice_fields or show_family_fields:
            invoice_defaults = [
                ("invoice_number", "Invoice Number", "invoice_number", "invoice_no", "invoice", "bill_number"),
                ("invoice_date", "Invoice Date", "invoice_date", "bill_date", "document_date"),
                ("billing_document_number", "Billing Document Number", "billing_document_number", "billing_number", "invoice_number"),
                ("reference_po_number", "Reference PO Number", "reference_po_number", "po_number", "original_po_number"),
                ("invoice_total", "Invoice Total", "invoice_total", "invoice_amount", "total_amount", "grand_total", "amount_due"),
                ("net_amount", "Net Amount", "net_amount", "subtotal", "amount"),
                ("tax_total", "Tax Total", "tax_total", "tax", "vat"),
                ("freight_total", "Freight Total", "freight_total", "shipping", "delivery_charge"),
                ("due_date", "Due Date", "due_date", "payment_due_date"),
                ("payment_terms", "Payment Terms", "payment_terms", "terms"),
                ("receipt_number", "Receipt Number", "receipt_number", "grn_number", "goods_receipt_number"),
                ("receipt_total", "Receipt Total", "receipt_total"),
            ]

            for key, label, *aliases in invoice_defaults:
                raw_value = header_details_json.get(key)
                if raw_value in [None, ""]:
                    for alias in aliases:
                        raw_value = header_details_json.get(alias)
                        if raw_value not in [None, ""]:
                            break
                default_mappings.append(
                    {
                        "key": key,
                        "label": label,
                        "value": str(raw_value or ""),
                    }
                )

        for idx, item in enumerate(source_items):
            display_line_no = getattr(item, "line_no", None) or (idx + 1)

            default_mappings.extend(
                [
                    {
                        "key": f"items.{idx}.line_no",
                        "label": f"Line {display_line_no} - Line Number",
                        "value": str(getattr(item, "line_no", "") or ""),
                    },
                    {
                        "key": f"items.{idx}.delivery_date",
                        "label": f"Line {display_line_no} - Delivery Date",
                        "value": str(_safe_iso(getattr(item, "delivery_date", None)) or ""),
                    },
                    {
                        "key": f"items.{idx}.delivery_time",
                        "label": f"Line {display_line_no} - Delivery Time",
                        "value": "",
                    },
                    {
                        "key": f"items.{idx}.ship_to_override",
                        "label": f"Line {display_line_no} - Ship To Override",
                        "value": "",
                    },
                    {
                        "key": f"items.{idx}.material_code",
                        "label": f"Line {display_line_no} - Product ID",
                        "value": str(getattr(item, "material_code", "") or ""),
                    },
                    {
                        "key": f"items.{idx}.mapped_product",
                        "label": f"Line {display_line_no} - Mapped Product",
                        "value": str(getattr(item, "material_code", "") or ""),
                    },
                    {
                        "key": f"items.{idx}.description",
                        "label": f"Line {display_line_no} - Description",
                        "value": str(getattr(item, "description", "") or ""),
                    },
                    {
                        "key": f"items.{idx}.line_details",
                        "label": f"Line {display_line_no} - Line Details",
                        "value": str(getattr(item, "description", "") or ""),
                    },
                    {
                        "key": f"items.{idx}.quantity",
                        "label": f"Line {display_line_no} - Quantity",
                        "value": str(getattr(item, "quantity", "") or ""),
                    },
                    {
                        "key": f"items.{idx}.mapped_quantity",
                        "label": f"Line {display_line_no} - Mapped Quantity",
                        "value": str(getattr(item, "quantity", "") or ""),
                    },
                    {
                        "key": f"items.{idx}.customer_uom",
                        "label": f"Line {display_line_no} - UOM",
                        "value": str(getattr(item, "uom", "") or ""),
                    },
                    {
                        "key": f"items.{idx}.supplier_uom_conversion_factor",
                        "label": f"Line {display_line_no} - UOM Conversion",
                        "value": "",
                    },
                    {
                        "key": f"items.{idx}.unit_price",
                        "label": f"Line {display_line_no} - Unit Price",
                        "value": str(getattr(item, "unit_price", "") or ""),
                    },
                    {
                        "key": f"items.{idx}.amount",
                        "label": f"Line {display_line_no} - Amount",
                        "value": str(getattr(item, "amount", "") or ""),
                    },
                ]
            )

        mappings: list[dict[str, Any]] = []

        for m in default_mappings:
            merged = dict(m)
            saved = mapping_full_map.get(merged["key"])

            if saved:
                if saved.get("value") not in [None, ""]:
                    merged["value"] = saved.get("value")

                if saved.get("text"):
                    merged["text"] = saved.get("text")

                if saved.get("bbox"):
                    merged["bbox"] = saved.get("bbox")

                if saved.get("source") not in [None, ""]:
                    merged["source"] = saved.get("source")

                if saved.get("confidence") is not None:
                    merged["confidence"] = saved.get("confidence")

            mappings.append(merged)

        for key, saved in mapping_full_map.items():
            exists = any(m["key"] == key for m in mappings)
            if not exists:
                mappings.append(
                    {
                        "key": key,
                        "label": saved.get("label") or key,
                        "value": saved.get("value", ""),
                        "text": saved.get("text", ""),
                        "bbox": saved.get("bbox"),
                        "source": saved.get("source"),
                        "confidence": saved.get("confidence"),
                    }
                )

        file_id = getattr(row, "file_id", None)
        file_row = None
        if file_id:
            file_row = db.query(models.FileStore).filter(models.FileStore.file_id == file_id).first()

        resolved_business_direction = self._infer_direction(row)
        if self._has_outbound_message(db, row):
            resolved_business_direction = "OUTBOUND"
        resolved_transport_direction = self._infer_transport_direction(row)
        looks_like_invoice = self._looks_like_invoice(row)
        preview_payload_source = getattr(row, "xml_payload", None) if resolved_business_direction == "OUTBOUND" else None
        if isinstance(preview_payload_source, (dict, list)):
            preview_text = json.dumps(preview_payload_source, ensure_ascii=False, indent=2, default=str)
        elif preview_payload_source not in [None, ""]:
            preview_text = str(preview_payload_source)
        else:
            preview_text = None
        preview_raw_text = preview_text or getattr(row, "raw_text", None)
        file_url = None if preview_payload_source not in [None, ""] else (f"http://127.0.0.1:8000/files/{file_id}/download" if file_id else None)
        file_name = (
            f"{(resolved_document_number or getattr(row, 'docnum', None) or getattr(row, 'po_number', None) or row.po_id)}.txt"
            if preview_payload_source not in [None, ""]
            else getattr(file_row, "original_file_name", None)
        )
        base_mime_type = getattr(file_row, "mime_type", None) or getattr(row, "target_content_type", None) or "application/pdf"
        explicit_message_type = str(getattr(row, "message_type", None) or "").upper()
        document_family_seed = str(
            resolved_message_family_field
            or resolved_message_type_field
            or resolved_document_type
            or resolved_order_type
            or getattr(row, "po_type", None)
            or ""
        ).upper()
        is_po_family = document_family_seed in {"PO", "ORDERS", "ORDER", "ORDER_RESPONSE", "ORDER_CHANGE", "ASN", "ORDRSP", "ORDCHG", "DESADV"}
        invoice_context = (
            not is_po_family
            and (
                explicit_message_type in {"INVOICE", "AP_INVOICE", "AR_INVOICE"}
                or str(resolved_document_type or resolved_order_type or getattr(row, "po_type", None) or "").upper() == "INVOICE"
                or (looks_like_invoice and not is_po_family)
            )
        )
        if explicit_message_type in {"AP_INVOICE", "AR_INVOICE"} and not is_po_family:
            resolved_message_type = explicit_message_type
        elif invoice_context:
            resolved_message_type = "AR_INVOICE" if resolved_business_direction == "OUTBOUND" else "AP_INVOICE"
        elif is_po_family:
            resolved_message_type = "ORDERS"
        else:
            resolved_message_type = (
                resolved_order_type
                or resolved_document_type
                or explicit_message_type
                or getattr(row, "po_type", None)
                or "ORDERS"
            )
        resolved_message_family = (
            "INVOICE"
            if invoice_context and not is_po_family
            else ("PO" if is_po_family else str(resolved_order_type or resolved_document_type or getattr(row, "po_type", None) or "ORDERS").upper())
        )

        return {
            "po_id": str(getattr(row, "po_id")),
            "file_id": str(file_id) if file_id else None,
            "client_id": str(getattr(row, "client_id", "") or ""),
            "po_number": resolved_document_number,
            "document_number": resolved_document_number,
            "po_date": resolved_document_date,
            "document_date": resolved_document_date,
            "invoice_number": next(
                (
                    entry.get("value")
                    for entry in mappings
                    if entry.get("key") == "invoice_number" and entry.get("value") not in [None, ""]
                ),
                None,
            ),
            "invoice_date": next(
                (
                    entry.get("value")
                    for entry in mappings
                    if entry.get("key") == "invoice_date" and entry.get("value") not in [None, ""]
                ),
                None,
            ),
            "invoice_total": next(
                (
                    entry.get("value")
                    for entry in mappings
                    if entry.get("key") == "invoice_total" and entry.get("value") not in [None, ""]
                ),
                None,
            ),
            "billing_document_number": next(
                (
                    entry.get("value")
                    for entry in mappings
                    if entry.get("key") == "billing_document_number" and entry.get("value") not in [None, ""]
                ),
                None,
            ),
            "reference_po_number": next(
                (
                    entry.get("value")
                    for entry in mappings
                    if entry.get("key") == "reference_po_number" and entry.get("value") not in [None, ""]
                ),
                None,
            ),
            "due_date": next(
                (
                    entry.get("value")
                    for entry in mappings
                    if entry.get("key") == "due_date" and entry.get("value") not in [None, ""]
                ),
                None,
            ),
            "payment_terms": next(
                (
                    entry.get("value")
                    for entry in mappings
                    if entry.get("key") == "payment_terms" and entry.get("value") not in [None, ""]
                ),
                None,
            ),
            "tax_total": next(
                (
                    entry.get("value")
                    for entry in mappings
                    if entry.get("key") == "tax_total" and entry.get("value") not in [None, ""]
                ),
                None,
            ),
            "freight_total": next(
                (
                    entry.get("value")
                    for entry in mappings
                    if entry.get("key") == "freight_total" and entry.get("value") not in [None, ""]
                ),
                None,
            ),
            "net_amount": next(
                (
                    entry.get("value")
                    for entry in mappings
                    if entry.get("key") == "net_amount" and entry.get("value") not in [None, ""]
                ),
                None,
            ),
            "receipt_number": next(
                (
                    entry.get("value")
                    for entry in mappings
                    if entry.get("key") == "receipt_number" and entry.get("value") not in [None, ""]
                ),
                None,
            ),
            "receipt_total": next(
                (
                    entry.get("value")
                    for entry in mappings
                    if entry.get("key") == "receipt_total" and entry.get("value") not in [None, ""]
                ),
                None,
            ),
            "docnum": getattr(row, "docnum", None),
            "transaction_id": (
                next(
                    (
                        entry.get("value")
                        for entry in mappings
                        if entry.get("key") == "invoice_number" and entry.get("value") not in [None, ""]
                    ),
                    None,
                )
                or next(
                    (
                        entry.get("value")
                        for entry in mappings
                        if entry.get("key") == "billing_document_number" and entry.get("value") not in [None, ""]
                    ),
                    None,
                )
                or resolved_document_number
                or getattr(row, "docnum", None)
            ),
            "supplier_name": getattr(row, "supplier_name", None),
            "currency": resolved_currency_code,
            "po_type": resolved_document_type,
            "order_type": resolved_order_type,
            "message_type": resolved_message_type,
            "message_family": resolved_message_family or resolved_message_family_field,
            "language_code": resolved_language_code,
            "header_details": resolved_header_details,
            "invoice_fields": header_details_json if show_invoice_fields else None,
            "status": getattr(row, "status", None),
            "sender": getattr(row, "sender", None) or resolved_supplier_name,
            "receiver": getattr(row, "receiver", None) or resolved_customer_name,
            "direction": resolved_business_direction,
            "business_direction": resolved_business_direction,
            "transport_direction": resolved_transport_direction,
            "source_channel": getattr(row, "source_channel", None) or getattr(row, "source_type", None),
            "environment": getattr(row, "environment", None),
            "source_type": getattr(row, "source_type", None),
            "po_confidence": getattr(row, "po_confidence", None),
            "po_validation_reason": getattr(row, "po_validation_reason", None),
            "created_at": _safe_iso(getattr(row, "created_at", None)),
            "received_at": _safe_iso(getattr(row, "received_at", None)),
            "processed_at": _safe_iso(getattr(row, "processed_at", None)),
            "delivered_at": _safe_iso(getattr(row, "delivered_at", None)),
            "file_url": file_url,
            "file_name": file_name,
            "mime_type": (
                base_mime_type
            ),
            "raw_text": preview_raw_text,
            "xml_payload": getattr(row, "xml_payload", None),
            "items": items,
            "mappings": mappings,
            "sold_to_partner": {
                "code": getattr(row, "sold_to", None),
                "name": None,
                "address": None,
                "matched": True if getattr(row, "sold_to", None) else False,
            },
                "ship_to_partner": {
                "code": resolved_ship_to_code,
                "name": resolved_ship_to_name,
                "address": resolved_ship_to_address,
                "matched": True if resolved_ship_to_code else False,
            },
            "delivery_partner": {
                "code": None,
                "name": None,
                "address": None,
                "matched": False,
            },
        }
    

monitoring_service = MonitoringService()
