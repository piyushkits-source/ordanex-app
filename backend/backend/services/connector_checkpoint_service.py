
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Iterable
from sqlalchemy.orm import Session
from backend.db import models


class ConnectorCheckpointService:
    CONFIG_TYPE = "connector_checkpoint"

    def _cfg_key(self, connection_key: str) -> str:
        return f"checkpoint::{connection_key}"

    def get_state(self, db: Session, *, client_id: str, connection_key: str) -> dict:
        row = (
            db.query(models.ClientConfig)
            .filter(
                models.ClientConfig.client_id == client_id,
                models.ClientConfig.config_type == self.CONFIG_TYPE,
                models.ClientConfig.config_key == self._cfg_key(connection_key),
            )
            .order_by(models.ClientConfig.updated_at.desc())
            .first()
        )
        return dict(row.config_value_json or {}) if row else {"processed": []}

    def save_state(self, db: Session, *, client_id: str, connection_key: str, state: dict) -> None:
        row = (
            db.query(models.ClientConfig)
            .filter(
                models.ClientConfig.client_id == client_id,
                models.ClientConfig.config_type == self.CONFIG_TYPE,
                models.ClientConfig.config_key == self._cfg_key(connection_key),
            )
            .first()
        )
        if row:
            row.config_value_json = state
        else:
            row = models.ClientConfig(
                client_id=client_id,
                config_type=self.CONFIG_TYPE,
                config_key=self._cfg_key(connection_key),
                config_value_json=state,
                is_active=True,
            )
            db.add(row)
        db.flush()

    def build_file_fingerprint(self, *, file_name: str, content: bytes) -> str:
        h = hashlib.sha256()
        h.update(file_name.encode("utf-8", errors="ignore"))
        h.update(content)
        return h.hexdigest()

    def has_processed(self, db: Session, *, client_id: str, connection_key: str, fingerprint: str) -> bool:
        state = self.get_state(db, client_id=client_id, connection_key=connection_key)
        return fingerprint in set(state.get("processed", []))

    def mark_processed(self, db: Session, *, client_id: str, connection_key: str, fingerprint: str) -> None:
        state = self.get_state(db, client_id=client_id, connection_key=connection_key)
        processed = list(state.get("processed", []))
        if fingerprint not in processed:
            processed.append(fingerprint)
        state["processed"] = processed[-1000:]
        self.save_state(db, client_id=client_id, connection_key=connection_key, state=state)


connector_checkpoint_service = ConnectorCheckpointService()
