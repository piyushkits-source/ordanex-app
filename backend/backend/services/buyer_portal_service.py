from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
import json
from pathlib import Path
import re
from typing import Any
from urllib.parse import quote
from uuid import uuid4

from fastapi import HTTPException, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session, joinedload

from backend.core.deps import UserContext
from backend.db import models, schemas
from backend.services.purchase_order_service import purchase_order_service
from backend.services.entitlement_service import get_client_entitlements, has_buyer_storefront_access
try:
    from backend.services.file_storage_service import (
        is_s3_storage_path,
        read_stored_file,
        resolve_local_file_path,
    )
except ImportError:
    def is_s3_storage_path(file_path: str | None) -> bool:
        return str(file_path or "").strip().lower().startswith("s3://")

    def resolve_local_file_path(file_path: str | None) -> Path:
        normalized = str(file_path or "").strip().replace("\\", "/")
        abs_path = Path(normalized)
        if not abs_path.is_absolute():
            abs_path = Path.cwd() / abs_path
        return abs_path.resolve()

    def read_stored_file(file_path: str) -> bytes:
        if is_s3_storage_path(file_path):
            raise RuntimeError("S3-backed protected storefront media requires the latest file_storage_service deployment.")
        abs_path = resolve_local_file_path(file_path)
        if not abs_path.exists():
            raise FileNotFoundError(str(abs_path))
        return abs_path.read_bytes()

DEFAULT_CATALOG = [
    {
        "sku": "ORD-1001",
        "name": "Premium Industrial Adhesive",
        "description": "High-performance adhesive for packaging and assembly lines.",
        "details": "Solvent-free adhesive designed for industrial assembly, laminating, and high-throughput packing stations.",
        "category": "Adhesives",
        "brand": "Ordanex Industrial",
        "unit_price": 115.0,
        "currency": "USD",
        "uom": "EA",
        "stock_status": "Available",
        "lead_time": "2-3 days",
        "min_order_qty": 10,
        "moq_uom": "EA",
        "payment_terms": "Net 30",
        "supplier_name": "Configured Supplier",
        "specifications": {
            "Viscosity": "Medium",
            "Temperature range": "-10C to 90C",
            "Packaging": "20 kg drum",
        },
    },
    {
        "sku": "ORD-2007",
        "name": "Protective Shipping Labels",
        "description": "Thermal labels for warehouse and shipment operations.",
        "details": "Ready-to-print label stock for barcode, shipping, and pallet workflows with ERP or manual order capture.",
        "category": "Packaging",
        "brand": "Ordanex Supply",
        "unit_price": 24.5,
        "currency": "USD",
        "uom": "BOX",
        "stock_status": "Available",
        "lead_time": "Same day",
        "min_order_qty": 5,
        "moq_uom": "BOX",
        "payment_terms": "Advance or approved credit",
        "supplier_name": "Configured Supplier",
        "specifications": {
            "Material": "Thermal paper",
            "Roll size": "4 x 6 in",
            "Case pack": "12 rolls",
        },
    },
    {
        "sku": "ORD-3012",
        "name": "Industrial Carton Pack",
        "description": "Heavy-duty cartons for cross-border shipping and storage.",
        "details": "Double-wall industrial cartons built for export, warehousing, and plant-to-distributor transfers.",
        "category": "Packaging",
        "brand": "TransitMax",
        "unit_price": 42.0,
        "currency": "USD",
        "uom": "PK",
        "stock_status": "Limited",
        "lead_time": "1-2 days",
        "min_order_qty": 2,
        "moq_uom": "PK",
        "payment_terms": "Net 15",
        "supplier_name": "Configured Supplier",
        "specifications": {
            "Burst strength": "275 lb",
            "Dimensions": "24 x 18 x 18 in",
            "Pack": "25 cartons",
        },
    },
    {
        "sku": "ORD-4105",
        "name": "Warehouse Scan Device",
        "description": "Handheld scanning device for receiving and pick-pack workflows.",
        "details": "Wireless scan device suited for receiving, picking, cycle counting, and outbound confirmation in ERP and non-ERP environments.",
        "category": "Devices",
        "brand": "FlowTrack",
        "unit_price": 289.0,
        "currency": "USD",
        "uom": "EA",
        "stock_status": "Available",
        "lead_time": "5-7 days",
        "min_order_qty": 1,
        "moq_uom": "EA",
        "payment_terms": "Advance payment",
        "supplier_name": "Configured Supplier",
        "specifications": {
            "Connectivity": "Wi-Fi / Bluetooth",
            "Battery": "12 hours",
            "Warranty": "12 months",
        },
    },
]

DEFAULT_STOREFRONT_SETTINGS = {
    "branding": {
        "storefront_title": "Buyer Portal",
        "hero_headline": "Shop products, submit orders, track fulfillment, and keep buyers informed in one storefront.",
        "hero_description": "Configure a storefront that supports ERP-integrated sellers and suppliers who manage commerce fully in Ordanex, while giving buyers a clear view of products, payment expectations, and order progress.",
        "support_email": "hello@ordanex.ai",
        "logo_url": "",
        "accent_color": "#2563eb",
        "banner_text": "",
    },
    "catalog": {
        "title": "Client Catalog",
        "description": "Publish supplier products with descriptions, specifications, pricing, and ordering rules.",
        "source_mode": "ERP_SYNCED",
        "source_label": "ERP-synced catalog",
        "sync_note": "Catalog data is expected to stay in sync with the client's ERP for enterprise-scale setups.",
        "items": [],
    },
    "commerce": {
        "seller_mode": "ERP_INTEGRATED",
        "order_flow_mode": "ERP_ORCHESTRATED",
        "buyer_tracking_mode": "LIVE_ERP",
        "supplier_display_name": "",
    },
    "payments": {
        "enabled": True,
        "mode": "INVOICE_LATER",
        "provider_name": "Supplier Direct",
        "accepted_methods": ["Bank transfer", "Card", "UPI"],
        "payment_terms": "Net 30",
        "payment_link_url": "",
        "payment_link_label": "Pay supplier",
        "proof_of_payment_instructions": "Share your transaction id, UTR number, or payment confirmation after completing payment.",
        "instructions": "Collect payment directly with the supplier using the methods listed on the storefront.",
    },
    "experience": {
        "show_product_specs": True,
        "show_inventory_status": True,
        "show_checkout_promises": True,
    },
    "pricing": {
        "combine_with_product_defaults": True,
        "buyer_rules": [],
        "ship_to_rules": [],
    },
    "access": {
        "approval_mode": "EMAIL_APPROVAL",
        "approved_buyers": [],
    },
}

INTERNAL_MEDIA_URL_RE = re.compile(
    r"^(?:https?://[^/]+)?/files/([0-9a-fA-F-]{36})/download/?(?:\?.*)?$"
)


@dataclass
class BuyerPortalResult:
    purchase_order: models.PurchaseOrder
    processed: dict[str, Any] | None = None


class BuyerPortalService:
    def _normalize_email(self, value: Any) -> str:
        return str(value or "").strip().lower()

    def _normalize_approved_buyers(self, value: Any) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            return []
        normalized: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in value:
            email = ""
            name = ""
            company_name = ""
            notes = ""
            if isinstance(item, dict):
                email = self._normalize_email(item.get("email") or item.get("buyer_email"))
                name = str(item.get("name") or item.get("buyer_name") or "").strip()
                company_name = str(item.get("company_name") or item.get("company") or "").strip()
                notes = str(item.get("notes") or "").strip()
            else:
                email = self._normalize_email(item)
            if not email or email in seen:
                continue
            seen.add(email)
            normalized.append({"email": email, "name": name, "company_name": company_name, "notes": notes})
        return normalized

    def _access_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        access = payload.get("access") if isinstance(payload.get("access"), dict) else {}
        approved_buyers = self._normalize_approved_buyers(access.get("approved_buyers"))
        return {
            "approval_mode": str(access.get("approval_mode") or "EMAIL_APPROVAL").strip().upper(),
            "approved_buyers": approved_buyers,
        }

    def _settings_row(self, db: Session, client_id: str):
        return (
            db.query(models.ClientConfig)
            .filter(models.ClientConfig.client_id == client_id)
            .filter(models.ClientConfig.config_type == "BUYER_PORTAL")
            .filter(models.ClientConfig.config_key == "SETTINGS")
            .filter(models.ClientConfig.is_active.is_(True))
            .order_by(models.ClientConfig.created_at.desc())
            .first()
        )

    def _client_name(self, db: Session, client_id: str) -> str:
        client = db.query(models.Client).filter(models.Client.client_id == client_id).first()
        return str(getattr(client, "client_name", "") or "").strip()

    def _settings_payload(self, row: models.ClientConfig | None) -> dict[str, Any]:
        payload = {}
        if row and isinstance(row.config_value_json, dict):
            payload = dict(row.config_value_json)
        branding = payload.get("branding") if isinstance(payload.get("branding"), dict) else {}
        catalog = payload.get("catalog") if isinstance(payload.get("catalog"), dict) else {}
        merged = {
            **DEFAULT_STOREFRONT_SETTINGS,
            **payload,
        }
        merged["branding"] = {**DEFAULT_STOREFRONT_SETTINGS["branding"], **branding}
        merged["catalog"] = {**DEFAULT_STOREFRONT_SETTINGS["catalog"], **catalog}
        merged["commerce"] = {
            **DEFAULT_STOREFRONT_SETTINGS["commerce"],
            **(payload.get("commerce") if isinstance(payload.get("commerce"), dict) else {}),
        }
        merged["payments"] = {
            **DEFAULT_STOREFRONT_SETTINGS["payments"],
            **(payload.get("payments") if isinstance(payload.get("payments"), dict) else {}),
        }
        merged["experience"] = {
            **DEFAULT_STOREFRONT_SETTINGS["experience"],
            **(payload.get("experience") if isinstance(payload.get("experience"), dict) else {}),
        }
        merged["pricing"] = {
            **DEFAULT_STOREFRONT_SETTINGS["pricing"],
            **(payload.get("pricing") if isinstance(payload.get("pricing"), dict) else {}),
        }
        if not isinstance(merged["pricing"].get("buyer_rules"), list):
            merged["pricing"]["buyer_rules"] = []
        if not isinstance(merged["pricing"].get("ship_to_rules"), list):
            merged["pricing"]["ship_to_rules"] = []
        merged["pricing"]["combine_with_product_defaults"] = bool(
            merged["pricing"].get("combine_with_product_defaults", True)
        )
        if not isinstance(merged["catalog"].get("items"), list):
            merged["catalog"]["items"] = []
        source_mode = str(merged["catalog"].get("source_mode") or "ERP_SYNCED").strip().upper()
        if source_mode not in {"ERP_SYNCED", "PLATFORM_MANAGED"}:
            source_mode = "ERP_SYNCED"
        merged["catalog"]["source_mode"] = source_mode
        merged["catalog"]["source_label"] = (
            "Platform-managed catalog" if source_mode == "PLATFORM_MANAGED" else "ERP-synced catalog"
        )
        merged["catalog"]["sync_note"] = (
            "Catalog is maintained directly in Ordanex by the client team."
            if source_mode == "PLATFORM_MANAGED"
            else "Catalog should stay aligned with the client's ERP and can be synced or refreshed from the ERP side."
        )
        merged["commerce"]["seller_mode"] = str(merged["commerce"].get("seller_mode") or "ERP_INTEGRATED").strip().upper()
        merged["commerce"]["order_flow_mode"] = str(merged["commerce"].get("order_flow_mode") or "ERP_ORCHESTRATED").strip().upper()
        merged["commerce"]["buyer_tracking_mode"] = str(merged["commerce"].get("buyer_tracking_mode") or "LIVE_ERP").strip().upper()
        methods = merged["payments"].get("accepted_methods")
        if isinstance(methods, str):
            methods = [item.strip() for item in methods.split(",") if item.strip()]
        elif not isinstance(methods, list):
            methods = list(DEFAULT_STOREFRONT_SETTINGS["payments"]["accepted_methods"])
        merged["payments"]["accepted_methods"] = [str(item).strip() for item in methods if str(item).strip()]
        merged["payments"]["enabled"] = bool(merged["payments"].get("enabled", True))
        merged["payments"]["mode"] = str(merged["payments"].get("mode") or "INVOICE_LATER").strip().upper()
        merged["payments"]["provider_name"] = str(merged["payments"].get("provider_name") or "Supplier Direct").strip() or "Supplier Direct"
        merged["payments"]["payment_terms"] = str(merged["payments"].get("payment_terms") or "Net 30").strip() or "Net 30"
        merged["payments"]["payment_link_url"] = str(merged["payments"].get("payment_link_url") or "").strip()
        merged["payments"]["payment_link_label"] = str(merged["payments"].get("payment_link_label") or "Pay supplier").strip() or "Pay supplier"
        merged["payments"]["proof_of_payment_instructions"] = (
            str(
                merged["payments"].get("proof_of_payment_instructions")
                or "Share your transaction id, UTR number, or payment confirmation after completing payment."
            ).strip()
            or "Share your transaction id, UTR number, or payment confirmation after completing payment."
        )
        for key in ("show_product_specs", "show_inventory_status", "show_checkout_promises"):
            merged["experience"][key] = bool(merged["experience"].get(key, True))
        access = payload.get("access") if isinstance(payload.get("access"), dict) else {}
        approved_buyers = self._normalize_approved_buyers(access.get("approved_buyers"))
        merged["access"] = {
            "approval_mode": str(access.get("approval_mode") or merged.get("access", {}).get("approval_mode") or "EMAIL_APPROVAL").strip().upper(),
            "approved_buyers": approved_buyers,
        }
        return merged

    def get_settings(self, db: Session, client_id: str) -> dict[str, Any]:
        self.assert_access(db, client_id)
        row = self._settings_row(db, client_id)
        payload = self._settings_payload(row)
        payload["commerce"]["supplier_display_name"] = (
            self._client_name(db, client_id)
            or payload.get("commerce", {}).get("supplier_display_name")
            or ""
        )
        return {
            "client_id": client_id,
            **payload,
        }

    def save_settings(self, db: Session, client_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        self.assert_access(db, client_id)
        row = self._settings_row(db, client_id)
        if row is None:
            row = models.ClientConfig(
                client_id=client_id,
                config_type="BUYER_PORTAL",
                config_key="SETTINGS",
                config_value_json={},
                is_active=True,
            )
            db.add(row)
        current = self._settings_payload(row)
        branding = payload.get("branding") if isinstance(payload.get("branding"), dict) else {}
        catalog = payload.get("catalog") if isinstance(payload.get("catalog"), dict) else {}
        commerce = payload.get("commerce") if isinstance(payload.get("commerce"), dict) else {}
        payments = payload.get("payments") if isinstance(payload.get("payments"), dict) else {}
        experience = payload.get("experience") if isinstance(payload.get("experience"), dict) else {}
        pricing = payload.get("pricing") if isinstance(payload.get("pricing"), dict) else {}
        current["branding"] = {**current["branding"], **branding}
        current["catalog"] = {**current["catalog"], **catalog}
        current["commerce"] = {**current.get("commerce", {}), **commerce}
        client_name = self._client_name(db, client_id)
        if client_name:
            current["commerce"]["supplier_display_name"] = client_name
        current["payments"] = {**current.get("payments", {}), **payments}
        current["experience"] = {**current.get("experience", {}), **experience}
        current["pricing"] = {**current.get("pricing", {}), **pricing}
        if not isinstance(current["pricing"].get("buyer_rules"), list):
            current["pricing"]["buyer_rules"] = []
        if not isinstance(current["pricing"].get("ship_to_rules"), list):
            current["pricing"]["ship_to_rules"] = []
        current["pricing"]["combine_with_product_defaults"] = bool(
            current["pricing"].get("combine_with_product_defaults", True)
        )
        source_mode = str(current["catalog"].get("source_mode") or "ERP_SYNCED").strip().upper()
        if source_mode not in {"ERP_SYNCED", "PLATFORM_MANAGED"}:
            source_mode = "ERP_SYNCED"
        current["catalog"]["source_mode"] = source_mode
        current["catalog"]["source_label"] = (
            "Platform-managed catalog" if source_mode == "PLATFORM_MANAGED" else "ERP-synced catalog"
        )
        current["catalog"]["sync_note"] = (
            "Catalog is maintained directly in Ordanex by the client team."
            if source_mode == "PLATFORM_MANAGED"
            else "Catalog should stay aligned with the client's ERP and can be synced or refreshed from the ERP side."
        )
        methods = current["payments"].get("accepted_methods")
        if isinstance(methods, str):
            methods = [item.strip() for item in methods.split(",") if item.strip()]
        elif not isinstance(methods, list):
            methods = list(DEFAULT_STOREFRONT_SETTINGS["payments"]["accepted_methods"])
        current["payments"]["accepted_methods"] = [str(item).strip() for item in methods if str(item).strip()]
        if isinstance(payload.get("banner_text"), str):
            current["branding"]["banner_text"] = payload.get("banner_text")
        access = payload.get("access") if isinstance(payload.get("access"), dict) else {}
        current["access"] = {
            **current.get("access", {}),
            **self._access_payload({"access": access}),
        }
        row.config_value_json = current
        row.is_active = True
        db.commit()
        db.refresh(row)
        return {
            "client_id": client_id,
            **self._settings_payload(row),
        }

    def get_access_state(self, db: Session, client_id: str, buyer_email: str | None = None) -> dict[str, Any]:
        entitlements = get_client_entitlements(db, client_id)
        settings_row = self._settings_row(db, client_id)
        settings = self._settings_payload(settings_row)
        approved_buyers = settings.get("access", {}).get("approved_buyers", [])
        normalized_email = self._normalize_email(buyer_email)
        approved = False
        approved_record = None
        if normalized_email:
            for record in approved_buyers:
                if self._normalize_email(record.get("email")) == normalized_email:
                    approved = True
                    approved_record = record
                    break
        approval_required = True
        return {
            "client_id": client_id,
            **entitlements,
            "buyer_email": normalized_email or None,
            "buyer_approved": approved,
            "approval_required": approval_required,
            "access_message": (
                "Approved buyer email required."
                if approval_required and not normalized_email
                else ("Email not approved for this storefront." if approval_required and not approved else "Access approved.")
            ),
            "approved_buyer_count": len(approved_buyers),
            "approved_buyer": approved_record,
        }

    def assert_access(self, db: Session, client_id: str) -> dict[str, Any]:
        access_state = self.get_access_state(db, client_id)
        if not access_state.get("buyer_storefront"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": "Buyer storefront is not enabled for this client.",
                    "subscription_type": access_state.get("subscription_type"),
                    "feature": "buyer_storefront",
                    "suggested_plans": ["PREMIUM", "ENTERPRISE"],
                },
            )
        return access_state

    def assert_buyer_authorized(self, db: Session, client_id: str, buyer_email: str | None) -> dict[str, Any]:
        normalized_email = self._normalize_email(buyer_email)
        access_state = self.get_access_state(db, client_id, normalized_email or None)
        if not access_state.get("buyer_storefront"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": "Buyer storefront is not enabled for this client.",
                    "subscription_type": access_state.get("subscription_type"),
                    "feature": "buyer_storefront",
                    "suggested_plans": ["PREMIUM", "ENTERPRISE"],
                },
            )
        if not normalized_email:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": "An approved buyer email is required to access this storefront.",
                    "feature": "buyer_storefront",
                    "approval_required": True,
                },
            )
        if not access_state.get("buyer_approved"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": "This buyer email is not approved for the storefront.",
                    "feature": "buyer_storefront",
                    "approval_required": True,
                    "buyer_email": normalized_email,
                },
            )
        return access_state

    def _normalize_catalog(self, value: Any) -> list[dict[str, Any]]:
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            items = value.get("items") or value.get("catalog") or []
            if isinstance(items, list):
                return [item for item in items if isinstance(item, dict)]
        return []

    def _protected_media_url(self, raw_url: Any, client_id: str, buyer_email: str) -> str | None:
        text = str(raw_url or "").strip()
        if not text:
            return None
        match = INTERNAL_MEDIA_URL_RE.match(text)
        if not match:
            return text
        file_id = match.group(1)
        encoded_client = quote(client_id, safe="")
        encoded_email = quote(buyer_email, safe="")
        return f"/buyer-portal/media/{file_id}?client_id={encoded_client}&buyer_email={encoded_email}"

    def _protect_catalog_media(self, item: dict[str, Any], client_id: str, buyer_email: str) -> dict[str, Any]:
        protected = dict(item)
        protected_image = self._protected_media_url(protected.get("image_url"), client_id, buyer_email)
        protected_video = self._protected_media_url(protected.get("video_url"), client_id, buyer_email)
        if protected_image:
            protected["image_url"] = protected_image
        if protected_video:
            protected["video_url"] = protected_video

        media = protected.get("media")
        if isinstance(media, list):
            next_media: list[dict[str, Any]] = []
            for entry in media:
                if not isinstance(entry, dict):
                    continue
                next_entry = dict(entry)
                protected_url = self._protected_media_url(next_entry.get("url"), client_id, buyer_email)
                protected_poster = self._protected_media_url(next_entry.get("poster_url"), client_id, buyer_email)
                if protected_url:
                    next_entry["url"] = protected_url
                if protected_poster:
                    next_entry["poster_url"] = protected_poster
                next_media.append(next_entry)
            protected["media"] = next_media

        return protected

    def get_catalog(self, db: Session, client_id: str, buyer_email: str | None = None) -> list[dict[str, Any]]:
        access_state = self.assert_buyer_authorized(db, client_id, buyer_email)
        approved_email = str(access_state.get("buyer_email") or buyer_email or "").strip().lower()
        supplier_name = self._client_name(db, client_id) or "Configured Supplier"
        settings_row = self._settings_row(db, client_id)
        if settings_row:
            settings = self._settings_payload(settings_row)
            catalog = self._normalize_catalog(settings.get("catalog"))
            if catalog:
                return [
                    self._protect_catalog_media(
                        {**item, "supplier_name": supplier_name},
                        client_id,
                        approved_email,
                    )
                    for item in catalog
                ]
            if str(settings.get("catalog", {}).get("source_mode") or "").strip().upper() == "PLATFORM_MANAGED":
                return [
                    self._protect_catalog_media(
                        {**item, "supplier_name": supplier_name},
                        client_id,
                        approved_email,
                    )
                    for item in DEFAULT_CATALOG
                ]
        cfg = (
            db.query(models.ClientConfig)
            .filter(
                models.ClientConfig.client_id == client_id,
                models.ClientConfig.config_type == "BUYER_PORTAL",
                models.ClientConfig.config_key == "CATALOG",
                models.ClientConfig.is_active.is_(True),
            )
            .order_by(models.ClientConfig.created_at.desc())
            .first()
        )
        if not cfg:
            return [
                self._protect_catalog_media(
                    {**item, "supplier_name": supplier_name},
                    client_id,
                    approved_email,
                )
                for item in DEFAULT_CATALOG
            ]

        catalog = self._normalize_catalog(cfg.config_value_json)
        final_catalog = catalog or DEFAULT_CATALOG
        supplier_name = self._client_name(db, client_id) or "Configured Supplier"
        return [
            self._protect_catalog_media(
                {**item, "supplier_name": supplier_name},
                client_id,
                approved_email,
            )
            for item in final_catalog
        ]

    def get_catalog_media(self, db: Session, file_id: Any, client_id: str, buyer_email: str) -> Response:
        self.assert_buyer_authorized(db, client_id, buyer_email)
        file_row = (
            db.query(models.FileStore)
            .filter(models.FileStore.file_id == file_id)
            .filter(models.FileStore.client_id == client_id)
            .first()
        )
        if not file_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found.")

        source_channel = str(file_row.source_channel or "").strip().upper()
        raw_path = str(file_row.file_path or "").strip()
        if source_channel != "PORTAL_CATALOG_MEDIA" or "/portal/catalog/" not in raw_path.replace("\\", "/"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Protected media access denied.")

        media_type = str(file_row.mime_type or "application/octet-stream")
        display_name = str(file_row.original_file_name or "media")

        if is_s3_storage_path(raw_path):
            try:
                file_bytes = read_stored_file(raw_path)
            except FileNotFoundError:
                raise HTTPException(status_code=status.HTTP_410_GONE, detail="Media no longer available.")
            response: Response = Response(content=file_bytes, media_type=media_type)
        else:
            abs_path = resolve_local_file_path(raw_path)
            if not abs_path.exists():
                raise HTTPException(status_code=status.HTTP_410_GONE, detail="Media no longer available.")
            response = FileResponse(path=str(abs_path), media_type=media_type)

        response.headers["Content-Disposition"] = f'inline; filename="{display_name}"'
        response.headers["Cache-Control"] = "private, no-store, max-age=0, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cross-Origin-Resource-Policy"] = "same-site"
        response.headers["Referrer-Policy"] = "same-origin"
        return response

    def _generate_po_number(self, client_id: str) -> str:
        stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        return f"WEB-{client_id[:8].upper()}-{stamp}"

    def _parse_header_details(self, value: Any) -> dict[str, Any]:
        if isinstance(value, dict):
            return dict(value)
        if isinstance(value, str) and value.strip():
            try:
                parsed = json.loads(value)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                return {}
        return {}

    def _normalize_invoice_payload(self, value: Any) -> dict[str, Any] | None:
        if not isinstance(value, dict):
            return None
        normalized = {
            "invoice_number": str(value.get("invoice_number") or "").strip() or None,
            "invoice_date": str(value.get("invoice_date") or "").strip() or None,
            "invoice_amount": float(value.get("invoice_amount")) if value.get("invoice_amount") not in (None, "") else None,
            "currency": str(value.get("currency") or "").strip() or None,
            "due_date": str(value.get("due_date") or "").strip() or None,
            "payment_status": str(value.get("payment_status") or "").strip() or None,
            "invoice_url": str(value.get("invoice_url") or "").strip() or None,
            "invoice_file_name": str(value.get("invoice_file_name") or "").strip() or None,
            "invoice_storage_key": str(value.get("invoice_storage_key") or "").strip() or None,
            "invoice_file_data_url": str(value.get("invoice_file_data_url") or "").strip() or None,
            "invoice_notes": str(value.get("invoice_notes") or "").strip() or None,
        }
        return normalized if any(v is not None for v in normalized.values()) else None

    def _normalize_shipment_payload(self, value: Any) -> dict[str, Any] | None:
        if not isinstance(value, dict):
            return None
        normalized = {
            "shipment_number": str(value.get("shipment_number") or "").strip() or None,
            "shipment_status": str(value.get("shipment_status") or "").strip() or None,
            "carrier": str(value.get("carrier") or "").strip() or None,
            "tracking_number": str(value.get("tracking_number") or "").strip() or None,
            "tracking_url": str(value.get("tracking_url") or "").strip() or None,
            "shipment_document_name": str(value.get("shipment_document_name") or "").strip() or None,
            "shipment_document_url": str(value.get("shipment_document_url") or "").strip() or None,
            "shipment_document_storage_key": str(value.get("shipment_document_storage_key") or "").strip() or None,
            "shipment_document_data_url": str(value.get("shipment_document_data_url") or "").strip() or None,
            "ship_date": str(value.get("ship_date") or "").strip() or None,
            "estimated_delivery_date": str(value.get("estimated_delivery_date") or "").strip() or None,
            "delivered_date": str(value.get("delivered_date") or "").strip() or None,
            "shipment_notes": str(value.get("shipment_notes") or "").strip() or None,
        }
        return normalized if any(v is not None for v in normalized.values()) else None

    def _normalize_payment_payload(self, value: Any) -> dict[str, Any] | None:
        if not isinstance(value, dict):
            return None
        normalized = {
            "payment_method": str(value.get("payment_method") or "").strip() or None,
            "payment_reference": str(value.get("payment_reference") or "").strip() or None,
            "payment_status": str(value.get("payment_status") or "").strip() or None,
            "payment_proof_name": str(value.get("payment_proof_name") or "").strip() or None,
            "payment_proof_url": str(value.get("payment_proof_url") or "").strip() or None,
            "payment_proof_storage_key": str(value.get("payment_proof_storage_key") or "").strip() or None,
            "payment_proof_data_url": str(value.get("payment_proof_data_url") or "").strip() or None,
            "payment_proof_uploaded_at": str(value.get("payment_proof_uploaded_at") or "").strip() or None,
        }
        return normalized if any(v is not None for v in normalized.values()) else None

    def _derive_payment_status(
        self,
        *,
        payments_enabled: bool,
        payment_mode: str,
        payment_reference: str | None,
        existing_status: str | None = None,
    ) -> str:
        if existing_status:
            text = str(existing_status).strip()
            if text:
                return text
        if not payments_enabled:
            return "Commercial terms handled directly with the supplier"
        if payment_reference:
            return "Payment reference received"
        if payment_mode == "PAYMENT_LINK":
            return "Awaiting payment through secure link"
        if payment_mode == "OFFLINE_TRANSFER":
            return "Awaiting remittance confirmation"
        return "Awaiting supplier invoice"

    def _tracking_status(self, done: bool, active: bool) -> str:
        if done:
            return "complete"
        if active:
            return "active"
        return "pending"

    def _build_tracking_steps(self, po: models.PurchaseOrder, meta: dict[str, Any]) -> list[dict[str, Any]]:
        seller_mode = str(meta.get("seller_mode") or "ERP_INTEGRATED").strip().upper()
        payments_enabled = bool(meta.get("payments_enabled", True))
        invoice = self._normalize_invoice_payload(meta.get("invoice")) or {}
        shipment = self._normalize_shipment_payload(meta.get("shipment")) or {}
        payment_status = self._derive_payment_status(
            payments_enabled=payments_enabled,
            payment_mode=str(meta.get("payment_mode") or "INVOICE_LATER").strip().upper(),
            payment_reference=meta.get("payment_reference"),
            existing_status=invoice.get("payment_status") or meta.get("payment_status"),
        )
        order_status = str(po.status or "").strip().upper()
        processed = bool(po.processed_at)
        dispatch_done = bool(str(po.dispatch_status or "").strip())
        ack_done = bool(str(po.ack_status or "").strip())
        payment_done = (
            not payments_enabled
            or bool(meta.get("payment_reference"))
            or any(token in payment_status.upper() for token in ("CAPTURED", "RECEIVED", "CONFIRMED", "PAID"))
        )
        invoice_done = bool(invoice.get("invoice_number"))
        invoice_detail = (
            f"Invoice {invoice.get('invoice_number')} issued"
            if invoice.get("invoice_number")
            else "Supplier has not issued an invoice yet."
        )
        if invoice.get("due_date"):
            invoice_detail += f" Due {invoice.get('due_date')}."
        processing_done = processed or dispatch_done or ack_done or order_status in {"SHIPPED", "DELIVERED", "COMPLETED", "INVOICED"}
        shipment_done = bool(shipment.get("shipment_number") or shipment.get("tracking_number") or dispatch_done)
        fulfillment_done = bool(shipment.get("delivered_date")) or order_status in {"DELIVERED", "COMPLETED"} or ack_done
        if seller_mode == "ERP_INTEGRATED":
            processing_detail = (
                f"ERP handoff: {po.review_status or 'Queued'}, dispatch: {po.dispatch_status or 'Pending'}."
            )
            fulfillment_detail = (
                f"Acknowledgement: {po.ack_status or 'Pending'}, processed at: {po.processed_at or 'Pending'}."
            )
            processing_label = "ERP / order processing"
            fulfillment_label = "Shipment & acknowledgement"
        else:
            processing_detail = po.review_status or "Supplier can confirm the order, reserve stock, and prepare fulfillment in Ordanex."
            tracking_token = shipment.get("tracking_number") or shipment.get("shipment_number") or "Pending"
            fulfillment_detail = (
                f"Shipment: {shipment.get('shipment_status') or po.delivery_status or 'Pending'}, "
                f"tracking: {tracking_token}."
            )
            if shipment.get("estimated_delivery_date"):
                fulfillment_detail += f" ETA {shipment.get('estimated_delivery_date')}."
            processing_label = "Supplier confirmation"
            fulfillment_label = "Fulfillment & delivery"
        return [
            {
                "key": "received",
                "label": "Order received",
                "status": "complete",
                "detail": po.po_number or str(po.po_id),
            },
            {
                "key": "invoice",
                "label": "Invoice",
                "status": self._tracking_status(invoice_done, True),
                "detail": invoice_detail,
            },
            {
                "key": "payment",
                "label": "Payment" if payments_enabled else "Commercial terms",
                "status": self._tracking_status(payment_done, invoice_done or True),
                "detail": payment_status,
            },
            {
                "key": "fulfillment",
                "label": fulfillment_label,
                "status": self._tracking_status(fulfillment_done, shipment_done or processing_done),
                "detail": fulfillment_detail,
            },
        ]

    def _serialize_order(self, po: models.PurchaseOrder) -> dict[str, Any]:
        payload = schemas.BuyerPortalOrderRead.model_validate(po, from_attributes=True).model_dump(mode="json")
        meta = self._parse_header_details(po.header_details)
        invoice = self._normalize_invoice_payload(meta.get("invoice"))
        shipment = self._normalize_shipment_payload(meta.get("shipment"))
        payment = self._normalize_payment_payload(
            {
                "payment_method": meta.get("payment_method"),
                "payment_reference": meta.get("payment_reference"),
                "payment_status": meta.get("payment_status"),
                "payment_proof_name": meta.get("payment_proof_name"),
                "payment_proof_url": meta.get("payment_proof_url"),
                "payment_proof_storage_key": meta.get("payment_proof_storage_key"),
                "payment_proof_data_url": meta.get("payment_proof_data_url"),
                "payment_proof_uploaded_at": meta.get("payment_proof_uploaded_at"),
            }
        )
        payment_status = self._derive_payment_status(
            payments_enabled=bool(meta.get("payments_enabled", True)),
            payment_mode=str(meta.get("payment_mode") or "INVOICE_LATER").strip().upper(),
            payment_reference=(payment or {}).get("payment_reference") or meta.get("payment_reference"),
            existing_status=(invoice or {}).get("payment_status") or meta.get("payment_status"),
        )
        payload.update(
            {
                "buyer_name": meta.get("buyer_name"),
                "buyer_email": meta.get("buyer_email"),
                "company_name": meta.get("company_name"),
                "payment_method": (payment or {}).get("payment_method") or meta.get("payment_method"),
                "payment_reference": (payment or {}).get("payment_reference") or meta.get("payment_reference"),
                "payment_status": payment_status,
                "payment_proof_name": (payment or {}).get("payment_proof_name"),
                "payment_proof_url": (payment or {}).get("payment_proof_url"),
                "payment_proof_storage_key": (payment or {}).get("payment_proof_storage_key"),
                "payment_proof_data_url": (payment or {}).get("payment_proof_data_url"),
                "payment": {**(payment or {}), "payment_status": payment_status} if payment or payment_status else None,
                "invoice": invoice,
                "shipment": shipment,
                "tracking_steps": self._build_tracking_steps(
                    po,
                    {
                        **meta,
                        "payment_status": payment_status,
                        "payment_reference": (payment or {}).get("payment_reference") or meta.get("payment_reference"),
                        "invoice": invoice,
                        "shipment": shipment,
                    },
                ),
            }
        )
        return payload

    def submit_order(
        self,
        db: Session,
        payload: schemas.BuyerPortalOrderCreate,
    ) -> BuyerPortalResult:
        self.assert_buyer_authorized(db, payload.client_id, payload.buyer_email)
        settings = self._settings_payload(self._settings_row(db, payload.client_id))
        commerce = settings.get("commerce") if isinstance(settings.get("commerce"), dict) else {}
        payments = settings.get("payments") if isinstance(settings.get("payments"), dict) else {}
        client = db.query(models.Client).filter(models.Client.client_id == payload.client_id).first()
        if not client:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found.")

        if not payload.items:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one item is required.")

        seller_mode = str(commerce.get("seller_mode") or "ERP_INTEGRATED").strip().upper()
        supplier_display_name = self._client_name(db, payload.client_id) or str(commerce.get("supplier_display_name") or client.client_name or "").strip() or client.client_name
        payment_mode = str(payments.get("mode") or "INVOICE_LATER").strip().upper()
        payments_enabled = bool(payments.get("enabled", True))
        payment_provider_name = str(payments.get("provider_name") or "Supplier Direct").strip() or "Supplier Direct"
        payment_terms = str(payments.get("payment_terms") or "Net 30").strip() or "Net 30"
        payment_link_url = str(payments.get("payment_link_url") or "").strip()
        payment_link_label = str(payments.get("payment_link_label") or "Pay supplier").strip() or "Pay supplier"
        proof_of_payment_instructions = (
            str(
                payments.get("proof_of_payment_instructions")
                or "Share your transaction id, UTR number, or payment confirmation after completing payment."
            ).strip()
            or "Share your transaction id, UTR number, or payment confirmation after completing payment."
        )
        payment_status = self._derive_payment_status(
            payments_enabled=payments_enabled,
            payment_mode=payment_mode,
            payment_reference=payload.payment_reference,
        )
        initial_status = "ORDER_RECEIVED" if seller_mode == "STANDALONE_COMMERCE" else "NEW"
        if seller_mode == "STANDALONE_COMMERCE" and payments_enabled and payment_mode in {"PAYMENT_LINK", "OFFLINE_TRANSFER"}:
            initial_status = "PAYMENT_RECEIVED" if payload.payment_reference else "PAYMENT_PENDING"

        po = models.PurchaseOrder(
            client_id=payload.client_id,
            po_number=self._generate_po_number(payload.client_id),
            po_date=date.today(),
            supplier_name=supplier_display_name,
            currency=payload.currency or client.default_currency or "USD",
            po_type="PO",
            order_type="BUYER_PORTAL",
            sold_to=payload.sold_to or payload.company_name or payload.buyer_name,
            ship_to=payload.ship_to,
            ship_to_name=payload.ship_to_name or payload.company_name or payload.buyer_name,
            ship_to_address=payload.ship_to_address,
            header_details=json.dumps(
                {
                    "channel": "BUYER_PORTAL",
                    "buyer_name": payload.buyer_name,
                    "buyer_email": payload.buyer_email,
                    "company_name": payload.company_name,
                    "notes": payload.notes,
                    "seller_mode": seller_mode,
                    "order_flow_mode": commerce.get("order_flow_mode"),
                    "buyer_tracking_mode": commerce.get("buyer_tracking_mode"),
                    "payment_mode": payment_mode,
                    "payment_method": payload.payment_method,
                    "payment_reference": payload.payment_reference,
                    "payment_status": payment_status,
                    "payment_proof_name": payload.payment_proof_name,
                    "payment_proof_url": payload.payment_proof_url,
                    "payment_proof_storage_key": payload.payment_proof_storage_key,
                    "payment_proof_data_url": payload.payment_proof_data_url,
                    "payment_proof_uploaded_at": datetime.utcnow().isoformat() if payload.payment_proof_name or payload.payment_proof_url or payload.payment_proof_data_url else None,
                    "payments_enabled": payments_enabled,
                    "payment_provider_name": payment_provider_name,
                    "payment_terms": payment_terms,
                    "payment_link_url": payment_link_url,
                    "payment_link_label": payment_link_label,
                    "proof_of_payment_instructions": proof_of_payment_instructions,
                    "supplier_display_name": supplier_display_name,
                },
                ensure_ascii=False,
            ),
            sender=payload.buyer_email,
            receiver=payload.client_id,
            direction="INBOUND",
            environment="PROD",
            status=initial_status,
            source_type="BUYER_PORTAL",
            po_confidence="100",
            raw_text=json.dumps(payload.model_dump(mode="json"), ensure_ascii=False, default=str),
            total_items=len(payload.items),
            created_by=payload.buyer_email,
        )
        db.add(po)
        db.flush()

        running_total = 0.0
        for index, item in enumerate(payload.items, start=1):
            line_amount = item.quantity * item.unit_price if item.quantity is not None and item.unit_price is not None else None
            if line_amount is not None:
                running_total += float(line_amount)
            db.add(
                models.PurchaseOrderItem(
                    po_id=po.po_id,
                    line_no=index,
                    material_code=item.sku,
                    description=item.description or item.name,
                    quantity=item.quantity,
                    uom=item.uom,
                    unit_price=item.unit_price,
                    amount=line_amount,
                    delivery_date=item.delivery_date,
                    plant=None,
                    is_corrected=False,
                )
            )

        po.po_validation_reason = f"Buyer portal order received with {len(payload.items)} item(s)."
        po.total_items = len(payload.items)
        db.commit()
        db.refresh(po)

        processed: dict[str, Any] | None = None
        seller_mode = str(commerce.get("seller_mode") or "ERP_INTEGRATED").strip().upper()
        if seller_mode == "STANDALONE_COMMERCE":
            po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_id == po.po_id).first() or po
            if payments_enabled and payment_mode in {"PAYMENT_LINK", "OFFLINE_TRANSFER"}:
                po.review_status = (
                    "BUYER_PORTAL_PAYMENT_SHARED" if payload.payment_reference else "BUYER_PORTAL_PAYMENT_PENDING"
                )
            else:
                po.review_status = "BUYER_PORTAL_STANDALONE_FLOW"
            po.po_validation_reason = (
                f"Buyer portal order saved for standalone commerce. {payment_status}. "
                f"Supplier can manage confirmation, payment, and fulfillment directly from Ordanex using {payment_provider_name}."
            )
            db.add(po)
            db.commit()
            db.refresh(po)
        else:
            try:
                buyer_ctx = UserContext(
                    user_id=payload.buyer_email,
                    email=payload.buyer_email,
                    role="BUYER_PORTAL",
                    client_id=payload.client_id,
                    permissions=[],
                )
                processed = purchase_order_service.process_purchase_order(
                    db,
                    po.po_id,
                    buyer_ctx,
                    skip_invoice_validation=True,
                )
            except Exception as exc:
                po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_id == po.po_id).first() or po
                po.status = "PENDING"
                po.review_status = "BUYER_PORTAL_PROCESSING_PENDING"
                po.po_validation_reason = f"Buyer portal order saved. Processing will resume automatically: {exc}"
                db.add(po)
                db.commit()
                db.refresh(po)

        return BuyerPortalResult(purchase_order=po, processed=processed)

    def get_order(self, db: Session, po_id):
        po = (
            db.query(models.PurchaseOrder)
            .options(joinedload(models.PurchaseOrder.items))
            .filter(models.PurchaseOrder.po_id == po_id)
            .first()
        )
        if not po:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
        return self._serialize_order(po)

    def list_orders(self, db: Session, client_id: str, buyer_email: str | None = None):
        self.assert_access(db, client_id)
        if buyer_email:
            self.assert_buyer_authorized(db, client_id, buyer_email)
        query = (
            db.query(models.PurchaseOrder)
            .options(joinedload(models.PurchaseOrder.items))
            .filter(models.PurchaseOrder.client_id == client_id)
            .order_by(models.PurchaseOrder.created_at.desc())
        )
        if buyer_email:
            query = query.filter(models.PurchaseOrder.sender == buyer_email)
        return [self._serialize_order(po) for po in query.limit(50).all()]

    def update_order_commerce(self, db: Session, po_id, payload: schemas.BuyerPortalOrderCommerceUpdate):
        po = (
            db.query(models.PurchaseOrder)
            .options(joinedload(models.PurchaseOrder.items))
            .filter(models.PurchaseOrder.po_id == po_id)
            .first()
        )
        if not po:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
        meta = self._parse_header_details(po.header_details)
        seller_mode = str(meta.get("seller_mode") or "").strip().upper()
        if seller_mode != "STANDALONE_COMMERCE":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invoice and shipment updates from the portal are only supported for standalone commerce orders.",
            )
        invoice_payload = self._normalize_invoice_payload(payload.invoice.model_dump(exclude_none=True) if payload.invoice else None)
        shipment_payload = self._normalize_shipment_payload(payload.shipment.model_dump(exclude_none=True) if payload.shipment else None)
        payment_payload = self._normalize_payment_payload(payload.payment.model_dump(exclude_none=True) if payload.payment else None)
        if invoice_payload is not None:
            meta["invoice"] = invoice_payload
            if invoice_payload.get("payment_status"):
                meta["payment_status"] = invoice_payload.get("payment_status")
        if shipment_payload is not None:
            meta["shipment"] = shipment_payload
            po.dispatch_status = shipment_payload.get("shipment_status") or po.dispatch_status
            po.delivery_status = shipment_payload.get("shipment_status") or po.delivery_status
            po.delivery_reference = shipment_payload.get("tracking_number") or shipment_payload.get("shipment_number") or po.delivery_reference
            po.delivery_response_text = shipment_payload.get("shipment_notes") or po.delivery_response_text
        if payment_payload is not None:
            if payment_payload.get("payment_method") is not None:
                meta["payment_method"] = payment_payload.get("payment_method")
            if payment_payload.get("payment_reference") is not None:
                meta["payment_reference"] = payment_payload.get("payment_reference")
            if payment_payload.get("payment_status") is not None:
                meta["payment_status"] = payment_payload.get("payment_status")
            if payment_payload.get("payment_proof_name") is not None:
                meta["payment_proof_name"] = payment_payload.get("payment_proof_name")
            if payment_payload.get("payment_proof_url") is not None:
                meta["payment_proof_url"] = payment_payload.get("payment_proof_url")
            if payment_payload.get("payment_proof_storage_key") is not None:
                meta["payment_proof_storage_key"] = payment_payload.get("payment_proof_storage_key")
            if payment_payload.get("payment_proof_data_url") is not None:
                meta["payment_proof_data_url"] = payment_payload.get("payment_proof_data_url")
            if any(
                payment_payload.get(key)
                for key in ("payment_proof_name", "payment_proof_url", "payment_proof_data_url")
            ):
                meta["payment_proof_uploaded_at"] = payment_payload.get("payment_proof_uploaded_at") or datetime.utcnow().isoformat()
        shipment_status = str((shipment_payload or {}).get("shipment_status") or po.delivery_status or "").strip().upper()
        payment_status = str(meta.get("payment_status") or "").strip().upper()
        if shipment_status in {"DELIVERED", "COMPLETED"}:
            po.status = "DELIVERED"
            po.review_status = "BUYER_PORTAL_DELIVERED"
        elif shipment_status in {"SHIPPED", "IN_TRANSIT", "DISPATCHED"}:
            po.status = "SHIPPED"
            po.review_status = "BUYER_PORTAL_SHIPPED"
        elif payment_status in {"PAID", "PAYMENT CONFIRMED", "PAYMENT RECEIVED", "PAYMENT CAPTURED"}:
            po.status = "PAYMENT_RECEIVED"
            po.review_status = "BUYER_PORTAL_PAYMENT_CONFIRMED"
        elif (invoice_payload or {}).get("invoice_number"):
            po.status = "INVOICED"
            po.review_status = "BUYER_PORTAL_INVOICE_SHARED"
        po.header_details = json.dumps(meta, ensure_ascii=False)
        db.add(po)
        db.commit()
        db.refresh(po)
        return self._serialize_order(po)


buyer_portal_service = BuyerPortalService()
