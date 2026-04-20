import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from sqlalchemy.orm import Session
from backend.db import models

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
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = from_email
        msg["To"] = ", ".join(recipients)
        msg.attach(MIMEText(body_html or "", "html"))
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

    if not row:
        return {}

    return row.config_value_json or {}

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
