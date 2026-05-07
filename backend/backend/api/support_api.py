"""
Support API — handles IT support requests from the Message Monitor UI.

A user clicks "Request" on a problematic PO. The frontend posts the PO context
plus the user's additional details here. We:
  1. Generate a ticket ID (SUP-YYYYMMDD-NNNN)
  2. Try to send an email via the existing email_service helper
  3. If SMTP isn't configured, log the request to stdout and still return success
     (graceful degradation — UI doesn't break in dev environments without SMTP)

Env vars consulted:
  SUPPORT_EMAIL_TO   recipient address (default: support@example.com)
  SUPPORT_EMAIL_FROM sender address (default: noreply@ordanex.local)
  SMTP_HOST          if set, attempts real send via this server
  SMTP_PORT          default 587
  SMTP_USER          optional auth username
  SMTP_PASS          optional auth password
  SMTP_USE_TLS       "true" / "false" (default: true)
"""
from __future__ import annotations

import logging
import os
import smtplib
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.core.deps import get_db
from backend.db import models

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/support", tags=["support"])


# ----- Request / Response schemas ---------------------------------------------

class SupportRequestIn(BaseModel):
    """Payload posted by the frontend Request modal."""
    po_id: str | None = None
    po_number: str | None = None
    customer: str | None = None
    supplier: str | None = None
    error_message: str | None = None
    additional_details: str = Field(default="", max_length=4000)
    user_email: str | None = None
    activity_log_excerpt: list[dict[str, Any]] = Field(default_factory=list)


class SupportRequestOut(BaseModel):
    status: str
    ticket_id: str
    message: str
    delivered_via: str  # "smtp" | "log" | "none"


# ----- Helpers ----------------------------------------------------------------

def _generate_ticket_id() -> str:
    """SUP-YYYYMMDD-HHMMSS — globally unique enough for a single-tenant install."""
    return "SUP-" + datetime.utcnow().strftime("%Y%m%d-%H%M%S")


def _build_email_body(payload: SupportRequestIn, ticket_id: str) -> str:
    """Format the support request as an HTML email body."""
    activity_html = ""
    if payload.activity_log_excerpt:
        rows = []
        for entry in payload.activity_log_excerpt[:10]:
            stage = entry.get("stage") or entry.get("action") or "—"
            msg = entry.get("message") or entry.get("remarks") or "—"
            ts = entry.get("log_time") or entry.get("created_at") or entry.get("action_time") or ""
            actor = entry.get("created_by") or entry.get("user_email") or entry.get("actor_email") or ""
            rows.append(
                f"<tr><td style='padding:4px 8px;border-bottom:1px solid #eee'>{ts}</td>"
                f"<td style='padding:4px 8px;border-bottom:1px solid #eee'>{stage}</td>"
                f"<td style='padding:4px 8px;border-bottom:1px solid #eee'>{actor}</td>"
                f"<td style='padding:4px 8px;border-bottom:1px solid #eee'>{msg}</td></tr>"
            )
        activity_html = (
            "<h3>Recent Activity</h3>"
            "<table style='border-collapse:collapse;font-family:monospace;font-size:12px'>"
            "<thead><tr>"
            "<th style='text-align:left;padding:4px 8px'>Time</th>"
            "<th style='text-align:left;padding:4px 8px'>Stage</th>"
            "<th style='text-align:left;padding:4px 8px'>Actor</th>"
            "<th style='text-align:left;padding:4px 8px'>Message</th>"
            "</tr></thead><tbody>"
            + "".join(rows)
            + "</tbody></table>"
        )

    return f"""<html><body style="font-family:-apple-system,sans-serif;color:#0f172a">
<h2>Support Request: {ticket_id}</h2>
<p><strong>Submitted by:</strong> {payload.user_email or '(unknown)'}</p>
<p><strong>Submitted at:</strong> {datetime.utcnow().isoformat()}Z</p>

<h3>Document Context</h3>
<table style="border-collapse:collapse">
<tr><td style="padding:4px 12px 4px 0"><strong>PO Number:</strong></td><td>{payload.po_number or '—'}</td></tr>
<tr><td style="padding:4px 12px 4px 0"><strong>PO ID:</strong></td><td>{payload.po_id or '—'}</td></tr>
<tr><td style="padding:4px 12px 4px 0"><strong>Customer:</strong></td><td>{payload.customer or '—'}</td></tr>
<tr><td style="padding:4px 12px 4px 0"><strong>Supplier:</strong></td><td>{payload.supplier or '—'}</td></tr>
</table>

<h3>Reported Error</h3>
<pre style="background:#f8fafc;padding:12px;border-radius:6px;white-space:pre-wrap">{payload.error_message or '(no error message captured)'}</pre>

<h3>User's Additional Details</h3>
<pre style="background:#f8fafc;padding:12px;border-radius:6px;white-space:pre-wrap">{payload.additional_details or '(none provided)'}</pre>

{activity_html}

<hr>
<p style="color:#64748b;font-size:12px">This message was generated by the Ordanex Message Monitor "Request" feature.</p>
</body></html>"""


def _try_send_email(subject: str, body_html: str, recipient: str) -> tuple[bool, str]:
    """
    Attempt SMTP send using env vars. Returns (success, detail).
    Returns (False, "no_smtp_configured") if SMTP_HOST is not set — caller
    should treat this as graceful degradation, not an error.
    """
    smtp_host = os.getenv("SMTP_HOST")
    if not smtp_host:
        return False, "no_smtp_configured"

    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")
    use_tls = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
    sender = os.getenv("SUPPORT_EMAIL_FROM", "noreply@ordanex.local")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = recipient
    msg.attach(MIMEText(body_html, "html"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            if use_tls:
                server.starttls()
            if smtp_user and smtp_pass:
                server.login(smtp_user, smtp_pass)
            server.sendmail(sender, [recipient], msg.as_string())
        return True, "sent"
    except Exception as exc:
        logger.exception("Support email send failed")
        return False, f"smtp_error: {exc}"


def _log_request_locally(ticket_id: str, payload: SupportRequestIn, body_html: str) -> None:
    """Log the support request when SMTP isn't available."""
    logger.info("=" * 70)
    logger.info("SUPPORT REQUEST RECEIVED (no SMTP — logged only)")
    logger.info("Ticket: %s", ticket_id)
    logger.info("From:   %s", payload.user_email or "(unknown)")
    logger.info("PO:     %s (%s)", payload.po_number or "—", payload.po_id or "—")
    logger.info("Error:  %s", (payload.error_message or "")[:200])
    logger.info("Notes:  %s", (payload.additional_details or "")[:200])
    logger.info("=" * 70)


# ----- Endpoint ---------------------------------------------------------------

@router.post("/request", response_model=SupportRequestOut)
def submit_support_request(
    payload: SupportRequestIn,
    db: Session = Depends(get_db),
) -> SupportRequestOut:
    """
    Accept a support request from the UI, generate a ticket id, try to email
    IT support. Always returns 200 (with `delivered_via` indicating channel)
    unless something is structurally wrong with the input.

    Also writes a po_logs row so the Activity Log reflects that a request was
    raised — only if a po_id is supplied.
    """
    if not (payload.po_id or payload.po_number or payload.error_message or payload.additional_details):
        raise HTTPException(
            status_code=400,
            detail="Request must include at least one of: po_id, po_number, error_message, or additional_details.",
        )

    ticket_id = _generate_ticket_id()
    recipient = os.getenv("SUPPORT_EMAIL_TO", "support@example.com")
    subject = f"[Ordanex Support] {ticket_id} — PO {payload.po_number or payload.po_id or '(no id)'}"
    body_html = _build_email_body(payload, ticket_id)

    sent, detail = _try_send_email(subject, body_html, recipient)
    if sent:
        delivered_via = "smtp"
        message = f"IT has been notified. We will contact you with the resolution. (Ticket {ticket_id})"
    elif detail == "no_smtp_configured":
        _log_request_locally(ticket_id, payload, body_html)
        delivered_via = "log"
        message = (
            f"Request recorded as ticket {ticket_id}. "
            "Email delivery is not configured in this environment, so IT was not auto-notified — "
            "an admin should configure SMTP_HOST in the backend .env."
        )
    else:
        _log_request_locally(ticket_id, payload, body_html)
        delivered_via = "none"
        message = (
            f"Request recorded as ticket {ticket_id}, but email delivery failed: {detail}. "
            "An admin has been alerted via server logs."
        )

    # Best-effort: log the request into po_logs so it shows in Activity tab
    if payload.po_id:
        try:
            log_row = models.PoLog(
                po_id=payload.po_id,
                client_id=_resolve_client_id(db, payload.po_id) or "UNKNOWN",
                level="INFO",
                stage="SUPPORT_REQUEST",
                message=f"Support request {ticket_id} raised. {payload.additional_details or ''}".strip(),
                created_by=payload.user_email or "unknown",
            )
            db.add(log_row)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Failed to write SUPPORT_REQUEST entry to po_logs")

    return SupportRequestOut(
        status="ok",
        ticket_id=ticket_id,
        message=message,
        delivered_via=delivered_via,
    )


def _resolve_client_id(db: Session, po_id: str) -> str | None:
    """Look up client_id for a PO. Returns None if PO not found."""
    try:
        po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_id == po_id).first()
        return po.client_id if po else None
    except Exception:
        return None
