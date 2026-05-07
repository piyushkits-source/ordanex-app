from __future__ import annotations

import email
import imaplib
import logging
import traceback
from email.header import decode_header
from typing import Any
from sqlalchemy.orm import Session

from backend.db import models
from backend.services.connector_checkpoint_service import connector_checkpoint_service
from backend.services.inbound_runtime_service import inbound_runtime_service

logger = logging.getLogger(__name__)


class EmailPollingService:
    CONFIG_TYPE = "client_email_connection"

    def normalize_email_config(
        self,
        *,
        client_id: str,
        connection_key: Any,
        config_json: dict[str, Any] | None = None,
        config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        cfg = dict(config_json or config or {})
        username = cfg.get("username") or cfg.get("email_address") or cfg.get("email")
        password = cfg.get("password") or cfg.get("password_token") or cfg.get("app_password")
        mailbox = cfg.get("folder") or cfg.get("mailbox") or "INBOX"
        subject_filter = cfg.get("subject_filter", "")
        allowed_senders = cfg.get("allowed_senders", [])

        return {
            "client_id": client_id,
            "connection_key": connection_key,
            "imap_host": cfg.get("host") or cfg.get("imap_host") or cfg.get("server"),
            "imap_port": cfg.get("port") or 993,
            "email_address": username,
            "username": username,
            "password_token": password,
            "password": password,
            "folder": mailbox,
            "mailbox": mailbox,
            "allowed_senders": allowed_senders,
            "subject_filter": subject_filter,
            "subject_contains": subject_filter,
            "pull_enabled": True,
        }

    def _load_connections(self, db: Session) -> list[dict[str, Any]]:
        rows = (
            db.query(models.TradingPartnerConnection)
            .filter(
                models.TradingPartnerConnection.connection_type == "EMAIL",
                models.TradingPartnerConnection.direction.in_(["INBOUND", "BOTH"]),
                models.TradingPartnerConnection.is_active == True,
            )
            .all()
        )

        print(f"[EmailPolling] Found {len(rows)} active EMAIL connections")

        configs = []
        for row in rows:
            configs.append(
                self.normalize_email_config(
                    client_id=row.client_id,
                    connection_key=row.connection_id,
                    config_json=row.config_json,
                )
            )

        return configs

    def validate_connection(self, cfg: dict[str, Any]) -> dict[str, Any]:
        host = cfg.get("imap_host") or cfg.get("host")
        port = int(cfg.get("imap_port") or cfg.get("port") or 993)
        username = cfg.get("username") or cfg.get("email") or cfg.get("email_address")
        password = cfg.get("password") or cfg.get("app_password") or cfg.get("password_token")
        mailbox = cfg.get("mailbox") or cfg.get("folder") or "INBOX"

        if not host or not username or not password:
            raise ValueError("Missing host/username/password for EMAIL connection.")

        mail = None
        try:
            mail = imaplib.IMAP4_SSL(host, port)
            mail.login(username, password)
            status, _data = mail.select(mailbox)
            if status != "OK":
                raise ValueError(f"Unable to select mailbox '{mailbox}' for {username}@{host}.")
            return {
                "success": True,
                "message": f"Connected to {username}@{host} and selected {mailbox}.",
                "client_id": cfg.get("client_id"),
                "mailbox": mailbox,
            }
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError(f"Email connection test failed: {exc}") from exc
        finally:
            try:
                if mail is not None:
                    mail.logout()
            except Exception:
                pass

    @staticmethod
    def _subject_filter_allows(subject: str, subject_contains: str) -> bool:
        subject_norm = (subject or "").strip().lower()
        filter_norm = (subject_contains or "").strip().lower()
        if not filter_norm:
            return True

        tokens = [token.strip() for token in filter_norm.replace(";", ",").split(",") if token.strip()]
        if not tokens:
            return True

        if any(token in subject_norm for token in tokens):
            return True

        # Mixed operational mailboxes often carry both PO and invoice traffic.
        # Keep invoice mail flowing even when an older PO-only filter remains.
        if "invoice" in subject_norm and any(token in {"po", "order", "orders"} for token in tokens):
            return True

        return False

    def poll_all(self, db: Session) -> dict:
        summary = {"scanned": 0, "imported": 0, "skipped": 0, "errors": 0}
        configs = self._load_connections(db)
        print(f"[EmailPolling] Polling {len(configs)} connection(s)")

        for cfg in configs:
            res = self.poll_connection(db, cfg)
            for k in summary:
                summary[k] += res.get(k, 0)

        print(f"[EmailPolling] Summary: {summary}")
        return summary

    def poll_connection(self, db: Session, cfg: dict[str, Any]) -> dict:
        scanned = imported = skipped = errors = 0

        host = cfg.get("imap_host") or cfg.get("host")
        port = int(cfg.get("imap_port") or cfg.get("port") or 993)
        username = cfg.get("username") or cfg.get("email") or cfg.get("email_address")
        password = cfg.get("password") or cfg.get("app_password") or cfg.get("password_token")
        mailbox = cfg.get("mailbox") or cfg.get("folder") or "INBOX"
        allowed_senders = [str(x).lower() for x in (cfg.get("allowed_senders") or [])]
        subject_contains = str(cfg.get("subject_contains") or "").strip().lower()
        client_id = cfg["client_id"]
        connection_key = cfg.get("connection_key") or f"email::{client_id}::{username}::{mailbox}"

        if not host or not username or not password:
            print(f"[EmailPolling] Skipping connection — missing host/username/password for client {client_id}")
            return {"scanned": 0, "imported": 0, "skipped": 0, "errors": 1}

        try:
            mail = imaplib.IMAP4_SSL(host, port)
            mail.login(username, password)
            mail.select(mailbox)

            # Only scan unread mail in the configured mailbox. This keeps the
            # poll focused on the active inbox/folder instead of reprocessing
            # historical mail every run.
            status, data = mail.search(None, "UNSEEN")
            if status != "OK":
                print(f"[EmailPolling] IMAP search failed for {username}@{host}: status={status}")
                return {"scanned": 0, "imported": 0, "skipped": 0, "errors": 1}

            message_ids = data[0].split()
            if not message_ids:
                print(f"[EmailPolling] No UNSEEN messages for {username}@{host}; skipping poll")
                mail.logout()
                return {"scanned": 0, "imported": 0, "skipped": 0, "errors": 0}

            scanned = len(message_ids)
            print(f"[EmailPolling] {username}@{host}: {scanned} message(s) queued for inspection")

            for msg_id in message_ids:
                status, msg_data = mail.fetch(msg_id, "(RFC822)")
                if status != "OK" or not msg_data:
                    print(f"[EmailPolling] Fetch failed for {username}@{host} message {msg_id.decode()} status={status}")
                    errors += 1
                    continue

                raw_email = msg_data[0][1]
                print(f"[EmailPolling] Processing {username}@{host} message {msg_id.decode()} raw_bytes={len(raw_email)}")
                fingerprint = connector_checkpoint_service.build_file_fingerprint(
                    file_name=f"email_{msg_id.decode()}", content=raw_email
                )
                if connector_checkpoint_service.has_processed(
                    db, client_id=client_id, connection_key=connection_key, fingerprint=fingerprint
                ):
                    print(f"[EmailPolling] Skipping {username}@{host} message {msg_id.decode()} — already processed by checkpoint")
                    skipped += 1
                    continue

                msg = email.message_from_bytes(raw_email)
                sender = str(msg.get("From") or "")
                subject = self._decode_header(str(msg.get("Subject") or ""))
                print(f"[EmailPolling] Message {msg_id.decode()} sender='{sender}' subject='{subject}'")

                if allowed_senders and not any(s in sender.lower() for s in allowed_senders):
                    print(f"[EmailPolling] Skipping {username}@{host} message {msg_id.decode()} — sender '{sender}' not in allowed_senders")
                    skipped += 1
                    continue
                if not self._subject_filter_allows(subject, subject_contains):
                    print(f"[EmailPolling] Skipping {username}@{host} message {msg_id.decode()} — subject '{subject}' does not match filter '{subject_contains}'")
                    skipped += 1
                    continue

                attachment_imported = False
                for part in msg.walk():
                    if part.get_content_maintype() == "multipart":
                        continue
                    filename = part.get_filename()
                    print(f"[EmailPolling] Part check {username}@{host} message {msg_id.decode()} filename={filename} content_type={part.get_content_type()}")
                    if not filename:
                        continue
                    payload = part.get_payload(decode=True) or b""
                    print(f"[EmailPolling] Importing attachment '{filename}' from {username}@{host} message {msg_id.decode()}")
                    inbound_runtime_service.register_inbound_file(
                        db,
                        client_id=client_id,
                        source_channel="EMAIL",
                        file_name=filename,
                        content=payload,
                        mime_type=part.get_content_type(),
                        requested_by=sender,
                        source_reference=msg.get("Message-ID") or subject,
                        extra_payload={"connection_key": connection_key, "subject": subject},
                    )
                    attachment_imported = True
                    imported += 1

                if not attachment_imported:
                    print(f"[EmailPolling] Skipping {username}@{host} message {msg_id.decode()} — no importable attachments found")
                    skipped += 1

                if attachment_imported:
                    connector_checkpoint_service.mark_processed(
                        db, client_id=client_id, connection_key=connection_key, fingerprint=fingerprint
                    )
                    try:
                        mail.store(msg_id, "+FLAGS", "\\Seen")
                    except Exception:
                        pass

            mail.logout()

        except Exception as exc:
            logger.exception("[EmailPolling] ERROR for %s@%s", username, host)
            print(f"[EmailPolling] TRACEBACK for {username}@{host}:\n{traceback.format_exc()}")
            try:
                db.rollback()
            except Exception:
                pass
            errors += 1

        return {"scanned": scanned, "imported": imported, "skipped": skipped, "errors": errors}

    @staticmethod
    def _decode_header(value: str) -> str:
        parts = []
        for decoded, charset in decode_header(value):
            if isinstance(decoded, bytes):
                parts.append(decoded.decode(charset or "utf-8", errors="ignore"))
            else:
                parts.append(decoded)
        return "".join(parts)


email_polling_service = EmailPollingService()
