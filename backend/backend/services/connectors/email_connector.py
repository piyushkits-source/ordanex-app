from __future__ import annotations

import email
import imaplib

# FIX: Corrected import path (was `backend.connectors.base` which does not exist)
from backend.services.connectors.base import BaseConnector
from backend.services.inbound_runtime_service import inbound_runtime_service


class EmailConnector(BaseConnector):

    def poll(self):
        print("[EmailConnector] Starting poll")

        host = self.config.get("host") or self.config.get("imap_host")
        port = int(self.config.get("port") or self.config.get("imap_port") or 993)
        username = self.config.get("username") or self.config.get("email_address")
        password = self.config.get("password") or self.config.get("password_token")
        mailbox = self.config.get("folder") or "INBOX"

        if not host or not username or not password:
            print("[EmailConnector] Missing email config — skipping")
            return {"scanned": 0, "imported": 0}

        try:
            mail = imaplib.IMAP4_SSL(host, port)
            mail.login(username, password)
            mail.select(mailbox)

            status, data = mail.search(None, "UNSEEN")
            if status != "OK":
                return {"scanned": 0, "imported": 0}

            ids = data[0].split()
            imported = 0

            for msg_id in ids:
                _, msg_data = mail.fetch(msg_id, "(RFC822)")
                if not msg_data:
                    continue
                msg = email.message_from_bytes(msg_data[0][1])

                for part in msg.walk():
                    filename = part.get_filename()
                    if not filename:
                        continue

                    payload = part.get_payload(decode=True)
                    inbound_runtime_service.register_inbound_file(
                        self.db,
                        client_id=self.config["client_id"],
                        source_channel="EMAIL",
                        file_name=filename,
                        content=payload,
                        requested_by="system_auto",
                    )
                    print(f"[EmailConnector] Processed attachment: {filename}")
                    imported += 1

                try:
                    mail.store(msg_id, "+FLAGS", "\\Seen")
                except Exception:
                    pass

            mail.logout()
            return {"scanned": len(ids), "imported": imported}

        except Exception as exc:
            print(f"[EmailConnector] ERROR: {exc!r}")
            return {"scanned": 0, "imported": 0}
