from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from typing import Any
import base64
import json
import time
import urllib.error
import urllib.request
from sqlalchemy.orm import Session
from backend.db.database import get_db
from backend.db import models, schemas
from backend.services.entitlement_service import get_client_entitlements
from backend.services.rbac import require_roles

router = APIRouter(
    prefix="/client-config",
    tags=["Client Config"],
    dependencies=[Depends(require_roles("super_admin"))],
)


def _sync_key_from_connection(row: models.ClientConnection) -> str | None:
    config_json = row.config_json or {}
    sync_object = str(config_json.get("sync_object") or "").strip().upper()
    if sync_object in {"UOM", "ADDRESS"}:
        return sync_object
    message_type = str(getattr(row, "message_type", "") or "").strip().upper()
    if "UOM" in message_type:
        return "UOM"
    if "ADDRESS" in message_type:
        return "ADDRESS"
    connection_name = str(getattr(row, "connection_name", "") or "").strip().upper()
    if "UOM" in connection_name:
        return "UOM"
    if "ADDRESS" in connection_name:
        return "ADDRESS"
    return None


def _sync_key_from_erp(row: models.ClientERPConfig) -> str | None:
    message_type = str(getattr(row, "message_type", "") or "").strip().upper()
    if "UOM" in message_type:
        return "UOM"
    if "ADDRESS" in message_type:
        return "ADDRESS"
    return None


def _sync_status_for_key(db: Session, client_id: str, sync_key: str) -> str:
    has_active_connection = (
        db.query(models.ClientConnection)
        .filter(models.ClientConnection.client_id == client_id)
        .filter(models.ClientConnection.is_active.is_(True))
        .filter(
            (models.ClientConnection.config_json["sync_object"].astext.ilike(sync_key))
            | (models.ClientConnection.connection_name.ilike(f"%{sync_key}%"))
        )
        .first()
        is not None
    )
    has_active_erp = (
        db.query(models.ClientERPConfig)
        .filter(models.ClientERPConfig.client_id == client_id)
        .filter(models.ClientERPConfig.is_active.is_(True))
        .filter(models.ClientERPConfig.message_type.ilike(f"%{sync_key}%"))
        .first()
        is not None
    )
    if has_active_connection and has_active_erp:
        return "READY"
    if has_active_connection or has_active_erp:
        return "CONFIGURED"
    return "NOT CONFIGURED"


def _record_sync_event(
    db: Session,
    *,
    client_id: str,
    sync_key: str,
    event_type: str,
    status: str,
    message: str | None = None,
    endpoint_url: str | None = None,
    source_system: str | None = None,
    target_system: str | None = None,
    records_synced: int = 0,
    duration_ms: int | None = None,
    last_synced_at: datetime | None = None,
    details_json: dict[str, Any] | None = None,
) -> None:
    try:
        row = models.ClientSyncEvent(
            client_id=client_id,
            sync_key=sync_key,
            event_type=event_type,
            status=status,
            message=message,
            endpoint_url=endpoint_url,
            source_system=source_system,
            target_system=target_system,
            records_synced=records_synced,
            duration_ms=duration_ms,
            last_synced_at=last_synced_at or datetime.utcnow(),
            details_json=details_json or {},
        )
        db.add(row)
        db.commit()
    except Exception:
        db.rollback()


def _sync_key_from_connection(row: models.ClientConnection) -> str | None:
    config_json = row.config_json or {}
    sync_object = str(config_json.get("sync_object") or "").strip().upper()
    if sync_object in {"UOM", "ADDRESS"}:
        return sync_object
    message_type = str(getattr(row, "message_type", "") or "").strip().upper()
    if "UOM" in message_type:
        return "UOM"
    if "ADDRESS" in message_type:
        return "ADDRESS"
    connection_name = str(getattr(row, "connection_name", "") or "").strip().upper()
    if "UOM" in connection_name:
        return "UOM"
    if "ADDRESS" in connection_name:
        return "ADDRESS"
    return None


def _sync_key_from_erp(row: models.ClientERPConfig) -> str | None:
    message_type = str(getattr(row, "message_type", "") or "").strip().upper()
    if "UOM" in message_type:
        return "UOM"
    if "ADDRESS" in message_type:
        return "ADDRESS"
    return None


def _sync_status_for_key(db: Session, client_id: str, sync_key: str) -> str:
    has_active_connection = (
        db.query(models.ClientConnection)
        .filter(models.ClientConnection.client_id == client_id)
        .filter(models.ClientConnection.is_active.is_(True))
        .filter(
            (models.ClientConnection.config_json["sync_object"].astext.ilike(sync_key))
            | (models.ClientConnection.connection_name.ilike(f"%{sync_key}%"))
        )
        .first()
        is not None
    )
    has_active_erp = (
        db.query(models.ClientERPConfig)
        .filter(models.ClientERPConfig.client_id == client_id)
        .filter(models.ClientERPConfig.is_active.is_(True))
        .filter(models.ClientERPConfig.message_type.ilike(f"%{sync_key}%"))
        .first()
        is not None
    )
    if has_active_connection and has_active_erp:
        return "READY"
    if has_active_connection or has_active_erp:
        return "CONFIGURED"
    return "NOT CONFIGURED"


def _record_sync_event(
    db: Session,
    *,
    client_id: str,
    sync_key: str,
    event_type: str,
    status: str,
    message: str | None = None,
    endpoint_url: str | None = None,
    source_system: str | None = None,
    target_system: str | None = None,
    records_synced: int = 0,
    duration_ms: int | None = None,
    last_synced_at: datetime | None = None,
    details_json: dict[str, Any] | None = None,
) -> None:
    try:
        row = models.ClientSyncEvent(
            client_id=client_id,
            sync_key=sync_key,
            event_type=event_type,
            status=status,
            message=message,
            endpoint_url=endpoint_url,
            source_system=source_system,
            target_system=target_system,
            records_synced=records_synced,
            duration_ms=duration_ms,
            last_synced_at=last_synced_at or datetime.utcnow(),
            details_json=details_json or {},
        )
        db.add(row)
        db.commit()
    except Exception:
        db.rollback()


def _build_sync_url(config_json: dict[str, Any], sync_key: str) -> str | None:
    key = sync_key.upper()
    endpoint = (
        config_json.get("endpoint_url")
        or config_json.get("webhook_url")
        or config_json.get("endpoint")
        or config_json.get(f"{key.lower()}_endpoint_url")
        or config_json.get(f"{key.lower()}_webhook_url")
    )
    if not endpoint:
        return None
    path = (
        config_json.get("resource_path")
        or config_json.get("path")
        or config_json.get(f"{key.lower()}_path")
        or ""
    )
    endpoint = str(endpoint).rstrip("/")
    path = str(path).strip()
    if not path:
        return endpoint
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{endpoint}{path}"


def _build_sync_headers(config_json: dict[str, Any]) -> dict[str, str]:
    auth_type = str(config_json.get("auth_type") or "").strip().upper()
    headers = {"Accept": "application/json, text/plain, */*"}
    token = config_json.get("token") or config_json.get("bearer_token") or config_json.get("access_token") or config_json.get("api_token")
    username = config_json.get("username")
    password = config_json.get("password_token") or config_json.get("password")
    if auth_type in {"BEARER", "TOKEN"} and token:
        headers["Authorization"] = f"Bearer {token}"
    elif auth_type == "BASIC" and username and password:
        raw = f"{username}:{password}".encode("utf-8")
        headers["Authorization"] = "Basic " + base64.b64encode(raw).decode("ascii")
    elif auth_type in {"API_KEY", "X_API_KEY"} and token:
        headers["X-API-Key"] = str(token)
    elif token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _parse_records_synced(response_bytes: bytes, content_type: str) -> int:
    if "json" not in content_type.lower():
        return 0
    try:
        payload = json.loads(response_bytes.decode("utf-8"))
    except Exception:
        return 0
    if isinstance(payload, list):
        return len(payload)
    if isinstance(payload, dict):
        for key in ("records_synced", "rows_synced", "row_count", "count", "synced"):
            value = payload.get(key)
            if isinstance(value, int):
                return value
            if isinstance(value, str) and value.isdigit():
                return int(value)
        for key in ("records", "items", "data", "results"):
            value = payload.get(key)
            if isinstance(value, list):
                return len(value)
        return 1
    return 0



@router.get("/clients", response_model=list[schemas.ClientRead])
def get_clients(db: Session = Depends(get_db)):
    return db.query(models.Client).order_by(models.Client.client_name.asc()).all()

@router.post("/clients", response_model=schemas.ClientRead)
def create_client(payload: schemas.ClientCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Client).filter(models.Client.client_id == payload.client_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Client already exists")
    row = models.Client(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.put("/clients/{client_id}", response_model=schemas.ClientRead)
def update_client(client_id: str, payload: schemas.ClientUpdate, db: Session = Depends(get_db)):
    row = db.query(models.Client).filter(models.Client.client_id == client_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _client_profile_config_map(db: Session, client_id: str) -> dict[str, models.ClientConfig]:
    rows = (
        db.query(models.ClientConfig)
        .filter(models.ClientConfig.client_id == client_id)
        .filter(models.ClientConfig.config_type == "CLIENT_PROFILE")
        .filter(
            models.ClientConfig.config_key.in_(
                ["LEGAL_TAX", "BILLING_INVOICING", "BANKING_REMITTANCE"]
            )
        )
        .all()
    )
    return {str(row.config_key or "").upper(): row for row in rows}


def _profile_section_payload(row: models.ClientConfig | None) -> dict[str, Any]:
    return row.config_value_json if row and isinstance(row.config_value_json, dict) else {}


@router.get("/client-profile-details/{client_id}", response_model=schemas.ClientProfileDetailsRead)
def get_client_profile_details(client_id: str, db: Session = Depends(get_db)):
    client = db.query(models.Client).filter(models.Client.client_id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    rows = _client_profile_config_map(db, client_id)
    return {
        "client_id": client_id,
        "legal_tax": _profile_section_payload(rows.get("LEGAL_TAX")),
        "billing_invoicing": _profile_section_payload(rows.get("BILLING_INVOICING")),
        "banking_remittance": _profile_section_payload(rows.get("BANKING_REMITTANCE")),
    }


@router.put("/client-profile-details/{client_id}", response_model=schemas.ClientProfileDetailsRead)
def upsert_client_profile_details(
    client_id: str,
    payload: schemas.ClientProfileDetailsUpdate,
    db: Session = Depends(get_db),
):
    client = db.query(models.Client).filter(models.Client.client_id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    rows = _client_profile_config_map(db, client_id)
    sections = {
        "LEGAL_TAX": payload.legal_tax.model_dump(),
        "BILLING_INVOICING": payload.billing_invoicing.model_dump(),
        "BANKING_REMITTANCE": payload.banking_remittance.model_dump(),
    }

    for key, value in sections.items():
        row = rows.get(key)
        if row is None:
            row = models.ClientConfig(
                client_id=client_id,
                config_type="CLIENT_PROFILE",
                config_key=key,
                config_value_json={},
                is_active=True,
            )
            db.add(row)
        row.config_value_json = value
        row.is_active = True

    db.commit()
    rows = _client_profile_config_map(db, client_id)
    return {
        "client_id": client_id,
        "legal_tax": _profile_section_payload(rows.get("LEGAL_TAX")),
        "billing_invoicing": _profile_section_payload(rows.get("BILLING_INVOICING")),
        "banking_remittance": _profile_section_payload(rows.get("BANKING_REMITTANCE")),
    }


def _buyer_storefront_config_row(db: Session, client_id: str):
    return (
        db.query(models.ClientConfig)
        .filter(models.ClientConfig.client_id == client_id)
        .filter(models.ClientConfig.is_active.is_(True))
        .filter(models.ClientConfig.config_type.in_(["FEATURES", "FEATURE_FLAG", "BUYER_PORTAL"]))
        .filter(models.ClientConfig.config_key.in_(["buyer_storefront", "buyer-storefront", "buyerstorefront"]))
        .order_by(models.ClientConfig.updated_at.desc(), models.ClientConfig.created_at.desc())
        .first()
    )


@router.get("/buyer-storefront/{client_id}")
def get_buyer_storefront_access(client_id: str, db: Session = Depends(get_db)):
    row = _buyer_storefront_config_row(db, client_id)
    entitlements = get_client_entitlements(db, client_id)
    config = row.config_value_json or {} if row else {}
    explicit_enabled = None
    if row and isinstance(config, dict):
        if "enabled" in config:
            explicit_enabled = bool(config.get("enabled"))
        elif "disabled" in config:
            explicit_enabled = not bool(config.get("disabled"))

    return {
        "client_id": client_id,
        "subscription_type": entitlements.get("subscription_type"),
        "enabled": bool(entitlements.get("buyer_storefront")),
        "source": entitlements.get("buyer_storefront_source"),
        "explicit_enabled": explicit_enabled,
        "config": config if isinstance(config, dict) else {},
    }


@router.put("/buyer-storefront/{client_id}")
def update_buyer_storefront_access(
    client_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
):
    if "enabled" not in payload:
        raise HTTPException(status_code=400, detail="'enabled' is required")

    enabled = bool(payload.get("enabled"))
    row = _buyer_storefront_config_row(db, client_id)
    if row is None:
        row = models.ClientConfig(
            client_id=client_id,
            config_type="BUYER_PORTAL",
            config_key="buyer_storefront",
            config_value_json={},
        )
        db.add(row)

    config = dict(row.config_value_json or {})
    config["enabled"] = enabled
    config["disabled"] = not enabled
    config["updated_at"] = datetime.utcnow().isoformat()
    if payload.get("note"):
        config["note"] = str(payload.get("note"))
    row.config_value_json = config
    row.is_active = True
    db.commit()
    db.refresh(row)

    entitlements = get_client_entitlements(db, client_id)
    return {
        "client_id": client_id,
        "subscription_type": entitlements.get("subscription_type"),
        "enabled": bool(entitlements.get("buyer_storefront")),
        "source": entitlements.get("buyer_storefront_source"),
        "explicit_enabled": enabled,
        "config": row.config_value_json or {},
    }



def _buyer_storefront_config_row(db: Session, client_id: str):
    return (
        db.query(models.ClientConfig)
        .filter(models.ClientConfig.client_id == client_id)
        .filter(models.ClientConfig.is_active.is_(True))
        .filter(models.ClientConfig.config_type.in_(["FEATURES", "FEATURE_FLAG", "BUYER_PORTAL"]))
        .filter(models.ClientConfig.config_key.in_(["buyer_storefront", "buyer-storefront", "buyerstorefront"]))
        .order_by(models.ClientConfig.updated_at.desc(), models.ClientConfig.created_at.desc())
        .first()
    )


@router.get("/buyer-storefront/{client_id}")
def get_buyer_storefront_access(client_id: str, db: Session = Depends(get_db)):
    row = _buyer_storefront_config_row(db, client_id)
    entitlements = get_client_entitlements(db, client_id)
    config = row.config_value_json or {} if row else {}
    explicit_enabled = None
    if row and isinstance(config, dict):
        if "enabled" in config:
            explicit_enabled = bool(config.get("enabled"))
        elif "disabled" in config:
            explicit_enabled = not bool(config.get("disabled"))

    return {
        "client_id": client_id,
        "subscription_type": entitlements.get("subscription_type"),
        "enabled": bool(entitlements.get("buyer_storefront")),
        "source": entitlements.get("buyer_storefront_source"),
        "explicit_enabled": explicit_enabled,
        "config": config if isinstance(config, dict) else {},
    }


@router.put("/buyer-storefront/{client_id}")
def update_buyer_storefront_access(
    client_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
):
    if "enabled" not in payload:
        raise HTTPException(status_code=400, detail="'enabled' is required")

    enabled = bool(payload.get("enabled"))
    row = _buyer_storefront_config_row(db, client_id)
    if row is None:
        row = models.ClientConfig(
            client_id=client_id,
            config_type="BUYER_PORTAL",
            config_key="buyer_storefront",
            config_value_json={},
        )
        db.add(row)

    config = dict(row.config_value_json or {})
    config["enabled"] = enabled
    config["disabled"] = not enabled
    config["updated_at"] = datetime.utcnow().isoformat()
    if payload.get("note"):
        config["note"] = str(payload.get("note"))
    row.config_value_json = config
    row.is_active = True
    db.commit()
    db.refresh(row)

    entitlements = get_client_entitlements(db, client_id)
    return {
        "client_id": client_id,
        "subscription_type": entitlements.get("subscription_type"),
        "enabled": bool(entitlements.get("buyer_storefront")),
        "source": entitlements.get("buyer_storefront_source"),
        "explicit_enabled": enabled,
        "config": row.config_value_json or {},
    }



def _buyer_storefront_settings_row(db: Session, client_id: str):
    return (
        db.query(models.ClientConfig)
        .filter(models.ClientConfig.client_id == client_id)
        .filter(models.ClientConfig.is_active.is_(True))
        .filter(models.ClientConfig.config_type == "BUYER_PORTAL")
        .filter(models.ClientConfig.config_key == "SETTINGS")
        .order_by(models.ClientConfig.updated_at.desc(), models.ClientConfig.created_at.desc())
        .first()
    )


@router.get("/buyer-storefront-settings/{client_id}")
def get_buyer_storefront_settings(client_id: str, db: Session = Depends(get_db)):
    row = _buyer_storefront_settings_row(db, client_id)
    settings = row.config_value_json if row and isinstance(row.config_value_json, dict) else {}
    return {
        "client_id": client_id,
        "settings": settings,
    }


@router.put("/buyer-storefront-settings/{client_id}")
def update_buyer_storefront_settings(
    client_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
):
    row = _buyer_storefront_settings_row(db, client_id)
    if row is None:
        row = models.ClientConfig(
            client_id=client_id,
            config_type="BUYER_PORTAL",
            config_key="SETTINGS",
            config_value_json={},
            is_active=True,
        )
        db.add(row)

    current = row.config_value_json if isinstance(row.config_value_json, dict) else {}
    branding = payload.get("branding") if isinstance(payload.get("branding"), dict) else {}
    catalog = payload.get("catalog") if isinstance(payload.get("catalog"), dict) else {}
    commerce = payload.get("commerce") if isinstance(payload.get("commerce"), dict) else {}
    payments = payload.get("payments") if isinstance(payload.get("payments"), dict) else {}
    experience = payload.get("experience") if isinstance(payload.get("experience"), dict) else {}
    access = payload.get("access") if isinstance(payload.get("access"), dict) else {}
    current = {
        **current,
        "branding": {**(current.get("branding") if isinstance(current.get("branding"), dict) else {}), **branding},
        "catalog": {**(current.get("catalog") if isinstance(current.get("catalog"), dict) else {}), **catalog},
        "commerce": {**(current.get("commerce") if isinstance(current.get("commerce"), dict) else {}), **commerce},
        "payments": {**(current.get("payments") if isinstance(current.get("payments"), dict) else {}), **payments},
        "experience": {**(current.get("experience") if isinstance(current.get("experience"), dict) else {}), **experience},
    }
    if access:
        approved_buyers = access.get("approved_buyers") if isinstance(access.get("approved_buyers"), list) else []
        normalized_buyers = []
        seen_emails = set()
        for item in approved_buyers:
            email = ""
            if isinstance(item, dict):
                email = str(item.get("email") or item.get("buyer_email") or "").strip().lower()
            else:
                email = str(item or "").strip().lower()
            if not email or email in seen_emails:
                continue
            seen_emails.add(email)
            normalized_buyers.append({"email": email})
        current["access"] = {
            **(current.get("access") if isinstance(current.get("access"), dict) else {}),
            "approval_mode": str(access.get("approval_mode") or "EMAIL_APPROVAL").strip().upper(),
            "approved_buyers": normalized_buyers,
        }
    if isinstance(payload.get("banner_text"), str):
        current.setdefault("branding", {})["banner_text"] = payload.get("banner_text")
    row.config_value_json = current
    row.is_active = True
    db.commit()
    db.refresh(row)
    return {
        "client_id": client_id,
        "settings": row.config_value_json if isinstance(row.config_value_json, dict) else {},
    }


def _normalize_catalog_items(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        for key in ("items", "catalog", "catalog_items", "products", "entries"):
            items = value.get(key)
            if isinstance(items, list):
                return [item for item in items if isinstance(item, dict)]
    return []


def _catalog_source_payloads(db: Session, client_id: str) -> list[dict[str, Any]]:
    payloads: list[dict[str, Any]] = []

    erp_rows = (
        db.query(models.ClientERPConfig)
        .filter(models.ClientERPConfig.client_id == client_id)
        .filter(models.ClientERPConfig.is_active.is_(True))
        .order_by(models.ClientERPConfig.updated_at.desc(), models.ClientERPConfig.created_at.desc())
        .all()
    )
    for row in erp_rows:
        config = row.config_json if isinstance(row.config_json, dict) else {}
        payloads.append(
            {
                "source_system": getattr(row, "erp_name", None) or getattr(row, "erp_system", None) or "ERP",
                "endpoint_url": config.get("endpoint_url") or config.get("webhook_url") or config.get("endpoint"),
                "items": _normalize_catalog_items(
                    config.get("catalog")
                    or config.get("catalog_items")
                    or config.get("items")
                    or config.get("product_catalog")
                    or config.get("products")
                ),
            }
        )

    connection_rows = (
        db.query(models.ClientConnection)
        .filter(models.ClientConnection.client_id == client_id)
        .filter(models.ClientConnection.is_active.is_(True))
        .order_by(models.ClientConnection.updated_at.desc(), models.ClientConnection.created_at.desc())
        .all()
    )
    for row in connection_rows:
        config = row.config_json if isinstance(row.config_json, dict) else {}
        payloads.append(
            {
                "source_system": getattr(row, "connection_name", None) or getattr(row, "message_type", None) or "CLIENT ERP",
                "endpoint_url": config.get("endpoint_url") or config.get("webhook_url") or config.get("endpoint"),
                "items": _normalize_catalog_items(
                    config.get("catalog")
                    or config.get("catalog_items")
                    or config.get("items")
                    or config.get("product_catalog")
                    or config.get("products")
                ),
            }
        )

    return payloads


@router.post("/buyer-storefront-catalog-sync/{client_id}")
def sync_buyer_storefront_catalog(client_id: str, db: Session = Depends(get_db)):
    row = _buyer_storefront_settings_row(db, client_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Buyer storefront settings not found.")

    settings = row.config_value_json if isinstance(row.config_value_json, dict) else {}
    catalog = settings.get("catalog") if isinstance(settings.get("catalog"), dict) else {}
    source_mode = str(catalog.get("source_mode") or "ERP_SYNCED").strip().upper()
    if source_mode != "ERP_SYNCED":
        raise HTTPException(
            status_code=400,
            detail="Catalog sync is available for ERP-synced storefronts. Switch the storefront source mode first.",
        )

    payloads = _catalog_source_payloads(db, client_id)
    synced_items: list[dict[str, Any]] = []
    source_system = "ERP"
    endpoint_url = None
    for payload in payloads:
        if payload["items"]:
            synced_items = payload["items"]
            source_system = str(payload.get("source_system") or "ERP")
            endpoint_url = payload.get("endpoint_url")
            break

    if not synced_items:
        synced_items = []

    current = row.config_value_json if isinstance(row.config_value_json, dict) else {}
    current_catalog = current.get("catalog") if isinstance(current.get("catalog"), dict) else {}
    current_catalog = {
        **current_catalog,
        "items": synced_items,
        "last_synced_at": datetime.utcnow().isoformat(),
        "source_mode": "ERP_SYNCED",
        "source_label": "ERP-synced catalog",
        "sync_note": "Catalog refreshed from the ERP-side configuration sources.",
    }
    current["catalog"] = current_catalog
    row.config_value_json = current
    row.is_active = True
    db.commit()
    db.refresh(row)

    try:
        db.add(
            models.ClientSyncEvent(
                client_id=client_id,
                sync_key="CATALOG",
                event_type="CATALOG_SYNC",
                status="SUCCESS" if synced_items else "NO_SOURCE",
                message="Catalog refreshed from ERP-side configuration." if synced_items else "No ERP catalog source found; storefront catalog left empty.",
                endpoint_url=endpoint_url,
                source_system=source_system,
                target_system="BUYER_PORTAL",
                records_synced=len(synced_items),
                last_synced_at=datetime.utcnow(),
                details_json={"catalog_items": len(synced_items)},
            )
        )
        db.commit()
    except Exception:
        db.rollback()

    return {
        "client_id": client_id,
        "records_synced": len(synced_items),
        "source_system": source_system,
        "settings": row.config_value_json if isinstance(row.config_value_json, dict) else {},
    }


@router.get("/verticals/{client_id}", response_model=list[schemas.VerticalRead])
def get_verticals(client_id: str, db: Session = Depends(get_db)):
    return (
        db.query(models.BusinessVertical)
        .filter(models.BusinessVertical.client_id == client_id)
        .order_by(models.BusinessVertical.vertical_name.asc())
        .all()
    )

@router.post("/verticals", response_model=schemas.VerticalRead)
def create_vertical(payload: schemas.VerticalCreate, db: Session = Depends(get_db)):
    row = models.BusinessVertical(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.put("/verticals/{vertical_id}", response_model=schemas.VerticalRead)
def update_vertical(vertical_id: str, payload: schemas.VerticalUpdate, db: Session = Depends(get_db)):
    row = db.query(models.BusinessVertical).filter(models.BusinessVertical.vertical_id == vertical_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Business vertical not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.get("/connections/{client_id}", response_model=list[schemas.ClientConnectionRead])
def get_connections(client_id: str, db: Session = Depends(get_db)):
    return (
        db.query(models.ClientConnection)
        .filter(models.ClientConnection.client_id == client_id)
        .order_by(models.ClientConnection.created_at.desc())
        .all()
    )

@router.post("/connections", response_model=schemas.ClientConnectionRead)
def create_connection(payload: schemas.ClientConnectionCreate, db: Session = Depends(get_db)):
    row = models.ClientConnection(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)

    sync_key = _sync_key_from_connection(row)
    if sync_key:
        _record_sync_event(
            db,
            client_id=row.client_id,
            sync_key=sync_key,
            event_type="CONFIG_UPDATED",
            status=_sync_status_for_key(db, row.client_id, sync_key),
            message=f"{sync_key} connection saved",
            endpoint_url=(row.config_json or {}).get("endpoint_url") or (row.config_json or {}).get("webhook_url"),
            source_system="CLIENT ERP",
            target_system=sync_key,
            details_json={"connection_id": str(row.connection_id), "connection_name": row.connection_name, "is_active": row.is_active},
        )
    return row

@router.put("/connections/{connection_id}", response_model=schemas.ClientConnectionRead)
def update_connection(connection_id: str, payload: schemas.ClientConnectionUpdate, db: Session = Depends(get_db)):
    row = db.query(models.ClientConnection).filter(models.ClientConnection.connection_id == connection_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.add(row)
    db.commit()
    db.refresh(row)

    sync_key = _sync_key_from_connection(row)
    if sync_key:
        _record_sync_event(
            db,
            client_id=row.client_id,
            sync_key=sync_key,
            event_type="CONFIG_UPDATED",
            status=_sync_status_for_key(db, row.client_id, sync_key),
            message=f"{sync_key} connection updated",
            endpoint_url=(row.config_json or {}).get("endpoint_url") or (row.config_json or {}).get("webhook_url"),
            source_system="CLIENT ERP",
            target_system=sync_key,
            details_json={"connection_id": str(row.connection_id), "connection_name": row.connection_name, "is_active": row.is_active},
        )
    return row

@router.get("/erp/{client_id}", response_model=list[schemas.ClientERPConfigRead])
def get_erp_configs(client_id: str, db: Session = Depends(get_db)):
    return (
        db.query(models.ClientERPConfig)
        .filter(models.ClientERPConfig.client_id == client_id)
        .order_by(models.ClientERPConfig.created_at.desc())
        .all()
    )

@router.post("/erp", response_model=schemas.ClientERPConfigRead)
def create_erp_config(payload: schemas.ClientERPConfigCreate, db: Session = Depends(get_db)):
    row = models.ClientERPConfig(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)

    sync_key = _sync_key_from_erp(row)
    if sync_key:
        _record_sync_event(
            db,
            client_id=row.client_id,
            sync_key=sync_key,
            event_type="ERP_CONFIG_UPDATED",
            status=_sync_status_for_key(db, row.client_id, sync_key),
            message=f"{sync_key} ERP config saved",
            source_system=row.erp_name,
            target_system=sync_key,
            details_json={"erp_config_id": str(row.erp_config_id), "message_type": row.message_type, "is_active": row.is_active},
        )
    return row

@router.put("/erp/{erp_config_id}", response_model=schemas.ClientERPConfigRead)
def update_erp_config(erp_config_id: str, payload: schemas.ClientERPConfigUpdate, db: Session = Depends(get_db)):
    row = db.query(models.ClientERPConfig).filter(models.ClientERPConfig.erp_config_id == erp_config_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="ERP config not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.add(row)
    db.commit()
    db.refresh(row)

    sync_key = _sync_key_from_erp(row)
    if sync_key:
        _record_sync_event(
            db,
            client_id=row.client_id,
            sync_key=sync_key,
            event_type="ERP_CONFIG_UPDATED",
            status=_sync_status_for_key(db, row.client_id, sync_key),
            message=f"{sync_key} ERP config updated",
            source_system=row.erp_name,
            target_system=sync_key,
            details_json={"erp_config_id": str(row.erp_config_id), "message_type": row.message_type, "is_active": row.is_active},
        )
    return row



@router.post("/sync/{client_id}/{sync_key}")
def trigger_client_sync(
    client_id: str,
    sync_key: str,
    db: Session = Depends(get_db),
):
    normalized_key = sync_key.strip().upper()
    if normalized_key not in {"UOM", "ADDRESS"}:
        raise HTTPException(status_code=400, detail="Unsupported sync key")

    connection = (
        db.query(models.ClientConnection)
        .filter(models.ClientConnection.client_id == client_id)
        .filter(models.ClientConnection.is_active.is_(True))
        .filter(
            (models.ClientConnection.config_json["sync_object"].astext.ilike(normalized_key))
            | (models.ClientConnection.connection_name.ilike(f"%{normalized_key}%"))
        )
        .order_by(models.ClientConnection.created_at.desc())
        .first()
    )
    if not connection:
        _record_sync_event(
            db,
            client_id=client_id,
            sync_key=normalized_key,
            event_type="SYNC_TRIGGER",
            status="FAILED",
            message=f"No active {normalized_key} connection found",
        )
        raise HTTPException(status_code=404, detail=f"No active {normalized_key} connection found")

    config_json = connection.config_json or {}
    url = _build_sync_url(config_json, normalized_key)
    if not url:
        _record_sync_event(
            db,
            client_id=client_id,
            sync_key=normalized_key,
            event_type="SYNC_TRIGGER",
            status="FAILED",
            message=f"No endpoint configured for {normalized_key}",
            details_json={"connection_id": str(connection.connection_id)},
        )
        raise HTTPException(status_code=400, detail=f"No endpoint configured for {normalized_key}")

    method = str(config_json.get("http_method") or "POST").strip().upper()
    timeout_seconds = int(config_json.get("timeout_seconds") or 30)
    headers = _build_sync_headers(config_json)
    payload = {
        "client_id": client_id,
        "sync_key": normalized_key,
        "connection_id": str(connection.connection_id),
        "source_system": config_json.get("source_system") or config_json.get("erp_name") or "CLIENT ERP",
        "target_system": normalized_key,
    }
    data_bytes = json.dumps(payload).encode("utf-8") if method != "GET" else None
    if data_bytes is not None:
        headers.setdefault("Content-Type", "application/json")

    request = urllib.request.Request(url=url, data=data_bytes, headers=headers, method=method)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            payload_bytes = response.read()
            content_type = response.headers.get("Content-Type") or ""
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            records_synced = _parse_records_synced(payload_bytes, content_type)
            _record_sync_event(
                db,
                client_id=client_id,
                sync_key=normalized_key,
                event_type="SYNC_SUCCESS",
                status="SUCCESS",
                message=f"{normalized_key} sync completed successfully",
                endpoint_url=url,
                source_system=str(config_json.get("source_system") or config_json.get("erp_name") or "CLIENT ERP"),
                target_system=normalized_key,
                records_synced=records_synced,
                duration_ms=elapsed_ms,
                details_json={
                    "connection_id": str(connection.connection_id),
                    "http_method": method,
                    "response_status": getattr(response, "status", None),
                    "content_type": content_type,
                },
            )
            return {
                "success": True,
                "sync_key": normalized_key,
                "endpoint_url": url,
                "records_synced": records_synced,
                "duration_ms": elapsed_ms,
                "response_status": getattr(response, "status", None),
            }
    except urllib.error.HTTPError as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        body = exc.read().decode("utf-8", errors="ignore") if hasattr(exc, "read") else ""
        _record_sync_event(
            db,
            client_id=client_id,
            sync_key=normalized_key,
            event_type="SYNC_FAILED",
            status="FAILED",
            message=f"{normalized_key} sync failed: HTTP {exc.code}",
            endpoint_url=url,
            source_system=str(config_json.get("source_system") or config_json.get("erp_name") or "CLIENT ERP"),
            target_system=normalized_key,
            duration_ms=elapsed_ms,
            details_json={
                "connection_id": str(connection.connection_id),
                "http_status": exc.code,
                "response_body": body[:2000],
            },
        )
        raise HTTPException(status_code=502, detail=f"{normalized_key} sync failed with HTTP {exc.code}")
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        _record_sync_event(
            db,
            client_id=client_id,
            sync_key=normalized_key,
            event_type="SYNC_FAILED",
            status="FAILED",
            message=f"{normalized_key} sync failed: {exc}",
            endpoint_url=url,
            source_system=str(config_json.get("source_system") or config_json.get("erp_name") or "CLIENT ERP"),
            target_system=normalized_key,
            duration_ms=elapsed_ms,
            details_json={"connection_id": str(connection.connection_id), "error": str(exc)},
        )
        raise HTTPException(status_code=502, detail=f"{normalized_key} sync failed: {exc}")

@router.get("/sync-events/{client_id}", response_model=list[schemas.ClientSyncEventRead])
def get_sync_events(
    client_id: str,
    sync_key: str | None = None,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    query = db.query(models.ClientSyncEvent).filter(models.ClientSyncEvent.client_id == client_id)
    if sync_key:
        query = query.filter(models.ClientSyncEvent.sync_key == sync_key.strip().upper())
    return query.order_by(models.ClientSyncEvent.created_at.desc()).limit(max(1, min(limit, 100))).all()


@router.post("/sync-events", response_model=schemas.ClientSyncEventRead)
def create_sync_event(payload: schemas.ClientSyncEventCreate, db: Session = Depends(get_db)):
    row = models.ClientSyncEvent(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

