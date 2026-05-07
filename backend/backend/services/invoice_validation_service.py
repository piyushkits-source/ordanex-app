from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy.orm import Session

from backend.db import models
from backend.db import models_partner_patch as partner_models
from backend.services.email_service import get_notification_config, send_notification


DEFAULT_TOLERANCE = Decimal("0.01")


def _safe_str(value: Any) -> str:
    return str(value).strip() if value not in (None, "") else ""


def _to_decimal(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _parse_json(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def _header_candidates(po, canonical: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    header = {}
    if canonical and isinstance(canonical.get("header"), dict):
        header = canonical.get("header") or {}
    return [
        header,
        _parse_json(getattr(po, "header_details", None)),
        getattr(po, "mapping_resolution_json", None) or {},
        canonical or {},
    ]


def _first_decimal(candidates: list[dict[str, Any]], keys: list[str]) -> tuple[Decimal | None, str | None]:
    for source in candidates:
        if not isinstance(source, dict):
            continue
        for key in keys:
            value = source.get(key)
            if value in (None, ""):
                continue
            decimal_value = _to_decimal(value)
            if decimal_value is not None:
                return decimal_value, key
    return None, None


def _get_items(po, canonical: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    if canonical and isinstance(canonical.get("items"), list) and canonical.get("items"):
        return [item for item in canonical.get("items") if isinstance(item, dict)]
    return [
        {
            "line_no": item.line_no,
            "material_code": getattr(item, "material_code", None),
            "description": getattr(item, "description", None),
            "quantity": getattr(item, "quantity", None),
            "uom": getattr(item, "uom", None),
            "unit_price": getattr(item, "unit_price", None),
            "amount": getattr(item, "amount", None),
            "delivery_date": str(getattr(item, "delivery_date", None)) if getattr(item, "delivery_date", None) else None,
        }
        for item in getattr(po, "items", []) or []
    ]


def _resolve_notification_recipients(db: Session, client_id: str) -> list[str]:
    cfg = get_notification_config(db, client_id)
    recipients = (
        cfg.get("approval_recipients")
        or cfg.get("review_recipients")
        or cfg.get("failure_recipients")
        or cfg.get("success_recipients")
        or []
    )
    if isinstance(recipients, str):
        recipients = [item.strip() for item in recipients.split(",") if item.strip()]
    partner_rows = (
        db.query(partner_models.PartnerNotification)
        .filter(
            partner_models.PartnerNotification.is_active.is_(True),
            partner_models.PartnerNotification.notification_type.in_(["APPROVAL", "PENDING", "FAILED"]),
        )
        .order_by(partner_models.PartnerNotification.created_at.desc())
        .all()
    )
    for row in partner_rows:
        row_recipients = []
        if getattr(row, "approval_recipients", None):
            row_recipients = [item.strip() for item in str(row.approval_recipients).split(",") if item.strip()]
        elif getattr(row, "email", None):
            row_recipients = [str(row.email).strip()]
        if row_recipients:
            recipients = [*row_recipients, *recipients]
            break

    return [str(item).strip() for item in recipients if str(item).strip()]


def _line_total(item: dict[str, Any]) -> Decimal | None:
    amount = _to_decimal(item.get("amount"))
    if amount is not None:
        return amount

    qty = _to_decimal(item.get("quantity"))
    unit_price = _to_decimal(item.get("unit_price"))
    if qty is not None and unit_price is not None:
        return qty * unit_price
    return None


def _sum_line_totals(items: list[dict[str, Any]]) -> Decimal:
    total = Decimal("0")
    for item in items:
        line_total = _line_total(item)
        if line_total is not None:
            total += line_total
    return total


def _find_reference_po_number(po, canonical: dict[str, Any] | None = None) -> str | None:
    candidates: list[str] = []
    for value in (
        getattr(po, "original_po_number", None),
        getattr(po, "po_number", None),
    ):
        if _safe_str(value):
            candidates.append(_safe_str(value))

    header_candidates = _header_candidates(po, canonical)
    for header in header_candidates:
        for key in ("reference_po_number", "po_number", "purchase_order_number", "order_number", "customer_po_number", "original_po_number"):
            value = _safe_str(header.get(key))
            if value:
                candidates.append(value)

    for value in candidates:
        if value:
            return value
    return None


def validate_outbound_invoice_totals(po, canonical: dict[str, Any] | None = None, *, tolerance: Decimal = DEFAULT_TOLERANCE) -> dict[str, Any]:
    items = _get_items(po, canonical)
    line_total = _sum_line_totals(items)
    header_candidates = _header_candidates(po, canonical)
    invoice_total, source_key = _first_decimal(
        header_candidates,
        [
            "invoice_total",
            "invoice_amount",
            "total_amount",
            "total",
            "grand_total",
            "amount_due",
            "document_total",
        ],
    )

    if invoice_total is None:
        return {
            "passed": False,
            "blocked": True,
            "reason": "Invoice total is missing, so line-item total validation cannot be completed.",
            "invoice_total": None,
            "line_total": str(line_total),
            "difference": None,
            "source_key": None,
            "details": {
                "item_count": len(items),
            },
        }

    difference = abs(line_total - invoice_total)
    passed = difference <= tolerance
    return {
        "passed": passed,
        "blocked": not passed,
        "reason": (
            "Invoice total matches line-item totals."
            if passed
            else f"Invoice total {invoice_total} does not match line-item total {line_total} (difference {difference})."
        ),
        "invoice_total": str(invoice_total),
        "line_total": str(line_total),
        "difference": str(difference),
        "source_key": source_key,
        "details": {
            "item_count": len(items),
            "tolerance": str(tolerance),
        },
    }


def validate_inbound_ap_invoice_3way(
    db: Session,
    po,
    canonical: dict[str, Any] | None = None,
    *,
    tolerance: Decimal = DEFAULT_TOLERANCE,
) -> dict[str, Any]:
    reference_po_number = _find_reference_po_number(po, canonical)
    if not reference_po_number:
        return {
            "passed": False,
            "blocked": True,
            "reason": "Reference PO number is missing, so 3-way matching cannot be completed.",
            "details": {},
        }

    reference_po = (
        db.query(models.PurchaseOrder)
        .filter(
            models.PurchaseOrder.client_id == po.client_id,
            models.PurchaseOrder.po_number == reference_po_number,
        )
        .order_by(models.PurchaseOrder.created_at.desc())
        .first()
    )
    if not reference_po:
        return {
            "passed": False,
            "blocked": True,
            "reason": f"No matching PO found for reference number {reference_po_number}.",
            "details": {"reference_po_number": reference_po_number},
        }

    receipt_snapshot = (
        db.query(models.APInvoiceReceiptSnapshot)
        .filter(
            models.APInvoiceReceiptSnapshot.client_id == po.client_id,
            models.APInvoiceReceiptSnapshot.reference_po_number == reference_po_number,
            models.APInvoiceReceiptSnapshot.is_active.is_(True),
        )
        .order_by(models.APInvoiceReceiptSnapshot.created_at.desc())
        .first()
    )
    if not receipt_snapshot:
        return {
            "passed": False,
            "blocked": True,
            "reason": f"No receipt snapshot is available for PO {reference_po_number}. Load ERP receipt data before 3-way matching.",
            "details": {"reference_po_number": reference_po_number},
        }

    invoice_items = _get_items(po, canonical)
    po_items = _get_items(reference_po, None)
    receipt_items = receipt_snapshot.line_snapshot_json or []

    invoice_total = _sum_line_totals(invoice_items)
    po_total = _sum_line_totals(po_items)
    receipt_total = _to_decimal(receipt_snapshot.receipt_total)
    if receipt_total is None:
        receipt_total = _sum_line_totals([item for item in receipt_items if isinstance(item, dict)])

    if receipt_total is None:
        return {
            "passed": False,
            "blocked": True,
            "reason": f"Receipt total is missing for PO {reference_po_number}, so 3-way matching cannot be completed.",
            "details": {"reference_po_number": reference_po_number},
        }

    if not po_items:
        return {
            "passed": False,
            "blocked": True,
            "reason": f"Matching PO {reference_po_number} does not contain line details required for 3-way matching.",
            "details": {"reference_po_number": reference_po_number},
        }

    # Simple line-level comparison by material code first, then line number.
    po_index: dict[str, dict[str, Any]] = {}
    for item in po_items:
        key = _safe_str(item.get("material_code")) or f"LINE-{item.get('line_no')}"
        po_index[key] = item

    receipt_index: dict[str, dict[str, Any]] = {}
    if isinstance(receipt_items, list):
        for item in receipt_items:
            if not isinstance(item, dict):
                continue
            key = _safe_str(item.get("material_code")) or f"LINE-{item.get('line_no')}"
            receipt_index[key] = item

    line_mismatches: list[str] = []
    matched_lines = 0
    for inv_item in invoice_items:
        key = _safe_str(inv_item.get("material_code")) or f"LINE-{inv_item.get('line_no')}"
        po_item = po_index.get(key)
        receipt_item = receipt_index.get(key)
        if not po_item or not receipt_item:
            line_mismatches.append(f"Missing PO/receipt line for {key}")
            continue

        inv_qty = _to_decimal(inv_item.get("quantity")) or Decimal("0")
        po_qty = _to_decimal(po_item.get("quantity")) or Decimal("0")
        receipt_qty = _to_decimal(receipt_item.get("quantity")) or Decimal("0")

        inv_amt = _line_total(inv_item) or Decimal("0")
        po_amt = _line_total(po_item) or Decimal("0")
        receipt_amt = _line_total(receipt_item) or Decimal("0")

        if (
            abs(inv_qty - po_qty) > tolerance
            or abs(inv_qty - receipt_qty) > tolerance
            or abs(inv_amt - po_amt) > tolerance
            or abs(inv_amt - receipt_amt) > tolerance
        ):
            line_mismatches.append(
                f"Mismatch for {key}: invoice qty/amount {inv_qty}/{inv_amt}, PO {po_qty}/{po_amt}, receipt {receipt_qty}/{receipt_amt}"
            )
        else:
            matched_lines += 1

    if line_mismatches:
        return {
            "passed": False,
            "blocked": True,
            "reason": "3-way match failed: " + "; ".join(line_mismatches[:5]),
            "details": {
                "reference_po_number": reference_po_number,
                "invoice_total": str(invoice_total),
                "po_total": str(po_total),
                "receipt_total": str(receipt_total),
                "matched_lines": matched_lines,
                "mismatch_count": len(line_mismatches),
            },
        }

    if abs(invoice_total - po_total) > tolerance or abs(invoice_total - receipt_total) > tolerance:
        return {
            "passed": False,
            "blocked": True,
            "reason": f"3-way match failed because totals do not align for PO {reference_po_number}.",
            "details": {
                "reference_po_number": reference_po_number,
                "invoice_total": str(invoice_total),
                "po_total": str(po_total),
                "receipt_total": str(receipt_total),
            },
        }

    return {
        "passed": True,
        "blocked": False,
        "reason": f"3-way match passed for PO {reference_po_number}.",
        "details": {
            "reference_po_number": reference_po_number,
            "invoice_total": str(invoice_total),
            "po_total": str(po_total),
            "receipt_total": str(receipt_total),
            "matched_lines": matched_lines,
        },
    }


def _build_invoice_approval_html(po, validation_result: dict[str, Any], canonical: dict[str, Any] | None = None) -> str:
    header = {}
    if canonical and isinstance(canonical.get("header"), dict):
        header = canonical.get("header") or {}

    details = validation_result.get("details") or {}
    reference_po_number = details.get("reference_po_number") or _find_reference_po_number(po, canonical) or "N/A"
    lines_html = ""
    items = _get_items(po, canonical)
    if items:
        rows = []
        for item in items[:20]:
            rows.append(
                "<tr>"
                f"<td style='padding:4px 8px;border-bottom:1px solid #eee'>{item.get('line_no') or '—'}</td>"
                f"<td style='padding:4px 8px;border-bottom:1px solid #eee'>{item.get('material_code') or '—'}</td>"
                f"<td style='padding:4px 8px;border-bottom:1px solid #eee'>{item.get('description') or '—'}</td>"
                f"<td style='padding:4px 8px;border-bottom:1px solid #eee'>{item.get('quantity') or '—'}</td>"
                f"<td style='padding:4px 8px;border-bottom:1px solid #eee'>{item.get('uom') or '—'}</td>"
                "</tr>"
            )
        lines_html = (
            "<h3>Invoice Lines</h3>"
            "<table style='border-collapse:collapse;font-size:12px'>"
            "<thead><tr>"
            "<th style='text-align:left;padding:4px 8px'>Line</th>"
            "<th style='text-align:left;padding:4px 8px'>Material</th>"
            "<th style='text-align:left;padding:4px 8px'>Description</th>"
            "<th style='text-align:left;padding:4px 8px'>Qty</th>"
            "<th style='text-align:left;padding:4px 8px'>UOM</th>"
            "</tr></thead><tbody>"
            + "".join(rows)
            + "</tbody></table>"
        )

    return f"""<html><body style="font-family:-apple-system,sans-serif;color:#0f172a">
<h2>Invoice Approval Required</h2>
<p><strong>PO / Reference:</strong> {reference_po_number}</p>
<p><strong>Invoice Number:</strong> {header.get("invoice_number") or header.get("document_number") or po.po_number or "—"}</p>
<p><strong>Status:</strong> {po.status or "PENDING"}</p>
<p><strong>Reason:</strong> {validation_result.get("reason") or "Invoice approval required."}</p>

<h3>Comparison Summary</h3>
<table style='border-collapse:collapse'>
<tr><td style='padding:4px 12px 4px 0'><strong>Invoice Total:</strong></td><td>{validation_result.get("details", {}).get("invoice_total") or "—"}</td></tr>
<tr><td style='padding:4px 12px 4px 0'><strong>PO Total:</strong></td><td>{validation_result.get("details", {}).get("po_total") or "—"}</td></tr>
<tr><td style='padding:4px 12px 4px 0'><strong>Receipt Total:</strong></td><td>{validation_result.get("details", {}).get("receipt_total") or "—"}</td></tr>
<tr><td style='padding:4px 12px 4px 0'><strong>Matched Lines:</strong></td><td>{validation_result.get("details", {}).get("matched_lines") or 0}</td></tr>
</table>

{lines_html}

<p style="margin-top:16px">Open Ordanex, review the invoice, and approve it from the Review queue to continue processing.</p>
<hr>
<p style="color:#64748b;font-size:12px">This approval request was generated automatically by Ordanex invoice validation.</p>
</body></html>"""


def request_invoice_approval(
    db: Session,
    *,
    po,
    validation_result: dict[str, Any],
    canonical: dict[str, Any] | None = None,
) -> dict[str, Any]:
    recipients = _resolve_notification_recipients(db, po.client_id)
    subject = f"[Ordanex] Invoice approval required for {getattr(po, 'po_number', None) or getattr(po, 'docnum', None) or po.po_id}"
    body_html = _build_invoice_approval_html(po, validation_result, canonical)
    attachments = []

    file_id = getattr(po, "file_id", None)
    if file_id:
        file_row = db.query(models.FileStore).filter(models.FileStore.file_id == file_id).first()
        if file_row and file_row.file_path:
            attachments.append(
                {
                    "filename": file_row.original_file_name or "invoice_attachment",
                    "path": file_row.file_path,
                    "mime_type": file_row.mime_type or "application/octet-stream",
                }
            )

    if not recipients:
        return {"sent": False, "reason": "No approval recipients configured."}

    sent, detail = send_notification(
        tenant_cfg={
            "notifications": {
                "enabled": True,
                "approval_recipients": recipients,
                "review_recipients": recipients,
                "failure_recipients": recipients,
            }
        },
        event_type="invoice_approval_request",
        subject=subject,
        body_html=body_html,
        attachments=attachments or None,
    )

    db.add(
        models.EmailLog(
            po_id=po.po_id,
            client_id=po.client_id,
            event_type="invoice_approval_request",
            recipients=", ".join(recipients),
            subject=subject,
            status="SENT" if sent else "FAILED",
            response_message=detail,
            created_by="system",
        )
    )
    db.commit()
    return {"sent": sent, "reason": detail, "recipients": recipients}
