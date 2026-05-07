import os
import smtplib
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from sqlalchemy.orm import Session
from backend.db import models


def _coerce_attachment_payload(attachment):
    if not isinstance(attachment, dict):
        return None

    filename = attachment.get("filename") or "attachment.bin"
    content_type = attachment.get("content_type") or "application/octet-stream"
    content = attachment.get("content")
    path = attachment.get("path")

    if content is None and path:
        try:
            content = Path(path).read_bytes()
        except Exception:
            return None

    if content is None:
        return None

    maintype, _, subtype = content_type.partition("/")
    maintype = maintype or "application"
    subtype = subtype or "octet-stream"

    part = MIMEBase(maintype, subtype)
    part.set_payload(content)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
    return part


def send_notification(tenant_cfg: dict, event_type: str, subject: str, body_html: str, attachments=None):
    notifications = tenant_cfg.get("notifications", {}) or {}
    if not notifications.get("enabled", False):
        return False, "Notifications are disabled"
    smtp_server = notifications.get("smtp_server")
    smtp_port = int(notifications.get("smtp_port", 587))
    smtp_username = notifications.get("smtp_username")
    smtp_password = notifications.get("smtp_password")
    from_email = notifications.get("from_email") or smtp_username
    use_tls = bool(notifications.get("use_tls", True))
    recipient_map = {
        "upload_success": notifications.get("success_recipients", []),
        "correction_saved": notifications.get("success_recipients", []),
        "xml_saved": notifications.get("success_recipients", []),
        "reprocess_success": notifications.get("success_recipients", []),
        "reprocess_failure": notifications.get("failure_recipients", []),
        "test": notifications.get("test_recipients", []),
    }
    recipients = recipient_map.get(event_type, [])
    if not recipients:
        return False, f"No recipients configured for event_type={event_type}"
    try:
        msg = MIMEMultipart("mixed")
        msg["Subject"] = subject
        msg["From"] = from_email
        msg["To"] = ", ".join(recipients)

        body_part = MIMEMultipart("alternative")
        body_part.attach(MIMEText(body_html or "", "html"))
        msg.attach(body_part)

        for attachment in attachments or []:
            part = _coerce_attachment_payload(attachment)
            if part is not None:
                msg.attach(part)

        with smtplib.SMTP(smtp_server, smtp_port, timeout=30) as server:
            if use_tls:
                server.starttls()
            if smtp_username and smtp_password:
                server.login(smtp_username, smtp_password)
            server.sendmail(from_email, recipients, msg.as_string())
        return True, "Email sent successfully"
    except Exception as e:
        return False, str(e)



def get_notification_config(db: Session, client_id: str) -> dict:
    row = (
        db.query(models.ClientConfig)
        .filter(
            models.ClientConfig.client_id == client_id,
            models.ClientConfig.config_type == "notification_settings",
            models.ClientConfig.config_key == "email",
            models.ClientConfig.is_active == True,
        )
        .order_by(models.ClientConfig.updated_at.desc())
        .first()
    )

    if row and row.config_value_json:
        return row.config_value_json or {}

    fallback = (
        db.query(models.ClientConfig)
        .filter(
            models.ClientConfig.client_id == client_id,
            models.ClientConfig.config_type == "notifications",
            models.ClientConfig.config_key == "default",
            models.ClientConfig.is_active == True,
        )
        .order_by(models.ClientConfig.updated_at.desc())
        .first()
    )

    return (fallback.config_value_json or {}) if fallback else {}


def send_client_notification(
    db: Session,
    client_id: str,
    event_type: str,
    subject: str,
    body_html: str,
    attachments=None,
):
    tenant_cfg = {
        "notifications": get_notification_config(db, client_id)
    }
    return send_notification(
        tenant_cfg=tenant_cfg,
        event_type=event_type,
        subject=subject,
        body_html=body_html,
        attachments=attachments,
    )


def _frontend_monitor_url(po_id) -> str:
    base = os.getenv("FRONTEND_BASE_URL") or os.getenv("APP_BASE_URL") or "http://127.0.0.1:5173"
    return f"{base.rstrip('/')}/monitoring?po_id={po_id}"


def _backend_file_url(file_id) -> str | None:
    if not file_id:
        return None
    base = os.getenv("BACKEND_BASE_URL") or "http://127.0.0.1:8000"
    return f"{base.rstrip('/')}/files/{file_id}/download"


def _po_attachment(db: Session, po):
    if not getattr(po, "file_id", None):
        return None

    file_row = (
        db.query(models.FileStore)
        .filter(models.FileStore.file_id == po.file_id)
        .first()
    )
    if not file_row:
        return None

    file_path = getattr(file_row, "file_path", None)
    if not file_path or not Path(file_path).exists():
        return None

    try:
        return {
            "filename": getattr(file_row, "original_file_name", None) or Path(file_path).name,
            "content": Path(file_path).read_bytes(),
            "content_type": getattr(file_row, "mime_type", None) or "application/octet-stream",
        }
    except Exception:
        return None


def send_po_failure_notification(
    db: Session,
    po,
    *,
    reason: str,
    missing_fields: list[str] | None = None,
    action_steps: list[str] | None = None,
    event_type: str = "reprocess_failure",
):
    missing_fields = [str(field) for field in (missing_fields or []) if str(field).strip()]
    action_steps = [str(step) for step in (action_steps or []) if str(step).strip()]

    po_ref = getattr(po, "po_number", None) or getattr(po, "docnum", None) or str(getattr(po, "po_id", ""))
    screen_url = _frontend_monitor_url(getattr(po, "po_id", ""))
    original_file_url = _backend_file_url(getattr(po, "file_id", None))

    body_lines = [
        "<h2>Ordanex Message Alert</h2>",
        f"<p><strong>Message Status:</strong> {getattr(po, 'status', None) or 'UNKNOWN'}</p>",
        f"<p><strong>PO#:</strong> {po_ref}</p>",
        f"<p><strong>Reason for failure:</strong> {reason}</p>",
    ]

    if missing_fields:
        body_lines.append("<p><strong>Missing / blocked fields:</strong></p><ul>" + "".join(f"<li>{field}</li>" for field in missing_fields) + "</ul>")

    body_lines.append(
        f'<p><strong>Screen URL:</strong> <a href="{screen_url}">Open Message Monitor</a></p>'
    )

    if original_file_url:
        body_lines.append(
            f'<p><strong>Original PO:</strong> <a href="{original_file_url}">Download original attachment</a></p>'
        )

    if action_steps:
        body_lines.append("<p><strong>Action steps required for issue resolution:</strong></p><ol>" + "".join(f"<li>{step}</li>" for step in action_steps) + "</ol>")

    attachment = _po_attachment(db, po)
    subject = f"[Ordanex][{getattr(po, 'status', None) or 'PENDING'}] PO {po_ref} requires attention"

    return send_client_notification(
        db=db,
        client_id=po.client_id,
        event_type=event_type,
        subject=subject,
        body_html="".join(body_lines),
        attachments=[attachment] if attachment else None,
    )
