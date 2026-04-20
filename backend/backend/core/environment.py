from __future__ import annotations

import os
from dataclasses import dataclass

@dataclass(frozen=True)
class EnvironmentSettings:
    env: str
    block_external_in_staging: bool
    database_url: str | None

def _normalize_env(value: str | None) -> str:
    raw = (value or "staging").strip().lower()
    if raw in {"prod", "production"}:
        return "production"
    return "staging"

settings = EnvironmentSettings(
    env=_normalize_env(os.getenv("ENV")),
    block_external_in_staging=(os.getenv("BLOCK_EXTERNAL_IN_STAGING", "true").lower() == "true"),
    database_url=os.getenv("DATABASE_URL"),
)

def current_environment() -> str:
    return settings.env

def is_staging() -> bool:
    return settings.env == "staging"

def is_production() -> bool:
    return settings.env == "production"
