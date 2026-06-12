from __future__ import annotations

from sqlalchemy.orm import Session

from backend.db import models

BUYER_STOREFRONT_FEATURE = "buyer_storefront"
BUILT_IN_BUYER_STOREFRONT_PLANS = {"premium", "enterprise"}
BUYER_STOREFRONT_CONFIG_TYPES = {"FEATURES", "FEATURE_FLAG", "BUYER_PORTAL"}


def _normalize_environment(value: str | None) -> str:
    normalized = str(value or "").strip().upper()
    if normalized in {"STAGING", "STAGE", "STG"}:
        return "STAGING"
    return "PROD"


def _feature_flag_keys(feature_key: str, environment: str | None) -> set[str]:
    env = _normalize_environment(environment).lower()
    compact = feature_key.replace("_", "")
    dashed = feature_key.replace("_", "-")
    return {
        feature_key.lower(),
        compact.lower(),
        dashed.lower(),
        f"{feature_key}_{env}".lower(),
        f"{compact}_{env}".lower(),
        f"{dashed}-{env}".lower(),
    }


def _normalize_flag(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on", "enabled"}


def _client_subscription(db: Session, client_id: str) -> str:
    client = db.query(models.Client).filter(models.Client.client_id == client_id).first()
    return str(getattr(client, "subscription_type", "") or "").strip().lower()


def _storefront_config_rows(db: Session, client_id: str):
    return (
        db.query(models.ClientConfig)
        .filter(models.ClientConfig.client_id == client_id)
        .filter(models.ClientConfig.is_active.is_(True))
        .filter(models.ClientConfig.config_type.in_(sorted(BUYER_STOREFRONT_CONFIG_TYPES)))
        .order_by(models.ClientConfig.updated_at.desc(), models.ClientConfig.created_at.desc())
        .all()
    )


def _feature_flag_state(
    db: Session,
    client_id: str,
    feature_key: str,
    environment: str | None = None,
) -> bool | None:
    valid_keys = _feature_flag_keys(feature_key, environment)
    for row in _storefront_config_rows(db, client_id):
        row_key = str(getattr(row, "config_key", "") or "").strip().lower()
        if row_key not in valid_keys:
            continue
        cfg = row.config_value_json or {}
        if "enabled" in cfg:
            return _normalize_flag(cfg.get("enabled"))
        if "disabled" in cfg:
            return not _normalize_flag(cfg.get("disabled"))
        if feature_key in cfg:
            return _normalize_flag(cfg.get(feature_key))
        if isinstance(cfg.get("features"), list):
            normalized = {str(item).strip().lower() for item in cfg.get("features", [])}
            if feature_key in normalized:
                return True
    return None


def get_client_entitlements(
    db: Session,
    client_id: str,
    environment: str | None = None,
) -> dict[str, object]:
    subscription = _client_subscription(db, client_id)
    override_state = _feature_flag_state(db, client_id, BUYER_STOREFRONT_FEATURE, environment)

    if override_state is False:
        buyer_storefront = False
        source = "feature_flag_disabled"
    elif override_state is True:
        buyer_storefront = True
        source = "feature_flag"
    else:
        buyer_storefront = subscription in BUILT_IN_BUYER_STOREFRONT_PLANS
        source = "subscription" if buyer_storefront else "none"

    return {
        "subscription_type": subscription or None,
        "buyer_storefront": buyer_storefront,
        "buyer_storefront_source": source,
        "buyer_storefront_disabled": override_state is False,
    }


def has_buyer_storefront_access(db: Session, client_id: str, environment: str | None = None) -> bool:
    return bool(get_client_entitlements(db, client_id, environment).get("buyer_storefront"))
