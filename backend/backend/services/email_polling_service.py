from __future__ import annotations

import email
import imaplib
from email.header import decode_header
from typing import Any
from sqlalchemy.orm import Session

from backend.db import models
from backend.services.connector_checkpoint_service import connector_checkpoint_service
from backend.services.inbound_runtime_service import inbound_runtime_service


class EmailPollingService:
    CONFIG_TYPE = "client_email_connection"

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
            cfg = dict(row.config_json or {})
            normalized = {
                "client_id": row.client_id,
                "connection_key": row.connection_id,
                "imap_host": cfg.get("host"),
                "imap_port": cfg.get("port") or 993,
                "username": cfg.get("username") or cfg.get("email_address"),
                "password": cfg.get("password") or cfg.get("password_token"),
                "mailbox": cfg.get("folder") or "INBOX",
                "allowed_senders": cfg.get("allowed_senders", []),
                "subject_contains": cfg.get("subject_filter", ""),
                "pull_enabled": True,
            }
            configs.append(normalized)

        return configs

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

            # FIX: Use UNSEEN so we only fetch new emails; checkpoint service also deduplicates.
            status, data = mail.search(None, "UNSEEN")
            if status != "OK":
                print(f"[EmailPolling] IMAP search failed for {username}@{host}: status={status}")
                return {"scanned": 0, "imported": 0, "skipped": 0, "errors": 1}

            message_ids = data[0].split()
            scanned = len(message_ids)
            print(f"[EmailPolling] {username}@{host}: {scanned} unseen message(s)")

            for msg_id in message_ids:
                status, msg_data = mail.fetch(msg_id, "(RFC822)")
                if status != "OK" or not msg_data:
                    errors += 1
                    continue

                raw_email = msg_data[0][1]
                fingerprint = connector_checkpoint_service.build_file_fingerprint(
                    file_name=f"email_{msg_id.decode()}", content=raw_email
                )
                if connector_checkpoint_service.has_processed(
                    db, client_id=client_id, connection_key=connection_key, fingerprint=fingerprint
                ):
                    skipped += 1
                    continue

                msg = email.message_from_bytes(raw_email)
                sender = str(msg.get("From") or "")
                subject = self._decode_header(str(msg.get("Subject") or ""))

                if allowed_senders and not any(s in sender.lower() for s in allowed_senders):
                    skipped += 1
                    continue
                if subject_contains and subject_contains not in subject.lower():
                    skipped += 1
                    continue

                attachment_imported = False
                for part in msg.walk():
                    if part.get_content_maintype() == "multipart":
                        continue
                    filename = part.get_filename()
                    if not filename:
                        continue
                    payload = part.get_payload(decode=True) or b""
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
            # FIX: Log the actual error so failures are diagnosable
            print(f"[EmailPolling] ERROR for {username}@{host}: {exc!r}")
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
