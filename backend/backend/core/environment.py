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


def _first_env_value() -> str | None:
    for key in ("APP_ENV", "ORDANEX_ENV", "ENVIRONMENT", "FASTAPI_ENV", "ENV"):
        value = os.getenv(key)
        if value:
            return value
    return None

settings = EnvironmentSettings(
    env=_normalize_env(_first_env_value()),
    block_external_in_staging=(os.getenv("BLOCK_EXTERNAL_IN_STAGING", "true").lower() == "true"),
    database_url=os.getenv("DATABASE_URL"),
)

def current_environment() -> str:
    return settings.env

def is_staging() -> bool:
    return settings.env == "staging"

def is_production() -> bool:
    return settings.env == "production"
