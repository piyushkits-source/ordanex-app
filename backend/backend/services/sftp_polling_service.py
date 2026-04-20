
from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import fnmatch
import io
import paramiko
from sqlalchemy.orm import Session

from backend.db import models
from backend.services.connector_checkpoint_service import connector_checkpoint_service
from backend.services.inbound_runtime_service import inbound_runtime_service


@dataclass
class SftpPollResult:
    scanned: int = 0
    imported: int = 0
    skipped: int = 0
    errors: int = 0


class SftpPollingService:
    CONFIG_TYPE = "client_connection"

    def _load_connections(self, db: Session) -> list[dict[str, Any]]:
        rows = (
            db.query(models.ClientConfig)
            .filter(
                models.ClientConfig.config_type == self.CONFIG_TYPE,
                models.ClientConfig.is_active == True,
            )
            .all()
        )
        configs: list[dict[str, Any]] = []
        for row in rows:
            cfg = dict(row.config_value_json or {})
            cfg.setdefault("client_id", row.client_id)
            cfg.setdefault("connection_key", row.config_key)
            if str(cfg.get("connection_type") or "").upper() == "SFTP" and bool(cfg.get("pull_enabled", True)):
                configs.append(cfg)
        return configs

    def poll_all(self, db: Session) -> dict:
        result = SftpPollResult()
        for cfg in self._load_connections(db):
            sub = self.poll_connection(db, cfg)
            result.scanned += sub.scanned
            result.imported += sub.imported
            result.skipped += sub.skipped
            result.errors += sub.errors
        return result.__dict__

    def poll_connection(self, db: Session, cfg: dict[str, Any]) -> SftpPollResult:
        result = SftpPollResult()
        host = cfg.get("host")
        port = int(cfg.get("port") or 22)
        username = cfg.get("username")
        password = cfg.get("password")
        remote_path = cfg.get("remote_inbound_path") or cfg.get("remote_path") or "/"
        archive_path = cfg.get("remote_archive_path") or cfg.get("archive_path")
        pattern = cfg.get("file_pattern") or "*"
        client_id = cfg["client_id"]
        connection_key = cfg.get("connection_key") or f"sftp::{client_id}::{host}::{remote_path}"

        if not host or not username:
            return SftpPollResult(errors=1)

        transport = None
        sftp = None
        try:
            transport = paramiko.Transport((host, port))
            transport.connect(username=username, password=password)
            sftp = paramiko.SFTPClient.from_transport(transport)
            remote_files = sftp.listdir(remote_path)
            matching = [name for name in remote_files if fnmatch.fnmatch(name, pattern)]
            result.scanned = len(matching)

            for file_name in matching:
                remote_file = remote_path.rstrip("/") + "/" + file_name
                with sftp.open(remote_file, "rb") as f:
                    content = f.read()

                fingerprint = connector_checkpoint_service.build_file_fingerprint(
                    file_name=file_name,
                    content=content,
                )
                if connector_checkpoint_service.has_processed(
                    db,
                    client_id=client_id,
                    connection_key=connection_key,
                    fingerprint=fingerprint,
                ):
                    result.skipped += 1
                    continue

                inbound_runtime_service.register_inbound_file(
                    db,
                    client_id=client_id,
                    source_channel="SFTP",
                    file_name=file_name,
                    content=content,
                    mime_type=self._guess_mime(file_name),
                    requested_by=username,
                    source_reference=remote_file,
                    extra_payload={"connection_key": connection_key, "host": host},
                )
                connector_checkpoint_service.mark_processed(
                    db,
                    client_id=client_id,
                    connection_key=connection_key,
                    fingerprint=fingerprint,
                )
                if archive_path:
                    target = archive_path.rstrip("/") + "/" + file_name
                    try:
                        sftp.rename(remote_file, target)
                    except Exception:
                        # Leave file in place if archive move fails; checkpoint still protects from duplicates.
                        pass
                result.imported += 1
        except Exception:
            db.rollback()
            result.errors += 1
        finally:
            if sftp:
                sftp.close()
            if transport:
                transport.close()
        return result

    @staticmethod
    def _guess_mime(file_name: str) -> str:
        lower = file_name.lower()
        if lower.endswith('.pdf'):
            return 'application/pdf'
        if lower.endswith('.xml'):
            return 'application/xml'
        if lower.endswith('.json'):
            return 'application/json'
        if lower.endswith('.csv'):
            return 'text/csv'
        if lower.endswith('.xlsx'):
            return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        if lower.endswith('.xls'):
            return 'application/vnd.ms-excel'
        return 'text/plain'


sftp_polling_service = SftpPollingService()
