from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from backend.db import models
from backend.services.layout_clustering_service import layout_clustering_service
from backend.services.visual_layout_clustering_service import (
    visual_layout_clustering_service,
)


class VendorLearningService:
    # -----------------------------------
    # NORMALIZATION HELPERS
    # -----------------------------------
    def _norm_str(self, value: Any) -> str:
        return "" if value is None else str(value).strip()

    def _norm_vendor(self, value: Any) -> str:
        return self._norm_str(value)

    def build_learning_party_key(self, customer_name: Any, supplier_name: Any) -> str:
        customer = self._norm_vendor(customer_name)
        supplier = self._norm_vendor(supplier_name)
        if customer and supplier:
            return f"{customer}::{supplier}"
        return customer or supplier

    def _norm_doc_type(self, value: Any) -> str:
        v = self._norm_str(value).upper()
        return v or "PO"

    def _norm_source_format(self, value: Any) -> str:
        v = self._norm_str(value).upper()
        return v or "UNKNOWN"

    def _as_uuid_or_none(self, value: Any):
        text = self._norm_str(value)
        if not text:
            return None
        try:
            return UUID(text)
        except Exception:
            return None

    def build_onboarding_validation_requirements_from_purchase_order(self, po) -> dict[str, Any]:
        return self._build_default_validation_requirements_from_po(po)

    def _build_default_validation_requirements_from_po(self, po) -> dict[str, Any]:
        field_requirements: dict[str, Any] = {}

        header_values = {
            "document_number": getattr(po, "po_number", None) or getattr(po, "original_po_number", None),
            "document_date": getattr(po, "po_date", None),
            "customer_name": getattr(po, "sender", None),
            "supplier_name": getattr(po, "receiver", None) or getattr(po, "supplier_name", None),
            "currency_code": getattr(po, "currency", None),
            "ship_to_code": getattr(po, "ship_to", None),
        }

        for field, value in header_values.items():
            if field in {"document_number", "customer_name", "supplier_name"} or self._norm_str(value):
                field_requirements[field] = "MANDATORY"

        items = list(getattr(po, "items", []) or [])
        if items:
            field_requirements["items.*.material_code"] = "MANDATORY"
            field_requirements["items.*.quantity"] = "MANDATORY"
            field_requirements["items.*.customer_uom"] = "MANDATORY"
            if any(self._norm_str(getattr(item, "delivery_date", None)) for item in items):
                field_requirements["items.*.delivery_date"] = "MANDATORY"

        return {"field_requirements": field_requirements}

    # -----------------------------------
    # FINGERPRINT BUILDERS
    # -----------------------------------
    def build_fingerprint(self, header: dict, items: list[dict], raw_text: str) -> dict:
        header = header or {}
        items = items or []
        raw_text = raw_text or ""

        return {
            "header_keys": sorted(list(header.keys())),
            "item_fields": sorted(list(items[0].keys())) if items else [],
            "text_hash": hashlib.md5(raw_text[:2000].encode()).hexdigest(),
            "line_count": len(items),
            "document_type": self._norm_doc_type(header.get("document_type")),
        }

    def build_fingerprint_hash(self, fingerprint: dict) -> str:
        return hashlib.sha256(
            json.dumps(fingerprint, sort_keys=True, default=str).encode()
        ).hexdigest()

    def build_visual_signature_from_mappings(
        self, mappings: list[dict[str, Any]]
    ) -> dict[str, Any]:
        return visual_layout_clustering_service.build_visual_signature(mappings or [])

    # -----------------------------------
    # LOOKUP / MATCH
    # -----------------------------------
    def get_best_learning_for_vendor(
        self,
        db: Session,
        *,
        client_id: str,
        supplier_name: str | None,
        header: dict,
        items: list[dict],
        raw_text: str,
        current_mappings: list[dict] | None = None,
        document_type: str = "PO",
        source_format: str = "UNKNOWN",
    ):
        supplier = self._norm_vendor(supplier_name)
        doc_type = self._norm_doc_type(document_type)
        src_fmt = self._norm_source_format(source_format)

        rows = (
            db.query(models.VendorLayoutLearning)
            .filter(models.VendorLayoutLearning.client_id == client_id)
            .filter(models.VendorLayoutLearning.supplier_name == supplier)
            .all()
        )

        if not rows:
            return None, "NEW_LAYOUT", 0.0, "NO_PROFILE"

        current_fp = self.build_fingerprint(header, items, raw_text)
        current_fp["document_type"] = doc_type
        current_fp["source_format"] = src_fmt

        current_visual = self.build_visual_signature_from_mappings(current_mappings or [])

        best_profile = None
        best_total = 0.0
        best_layout_type = "NEW_LAYOUT"
        best_match_type = "TEXTUAL_ONLY"

        for profile in rows:
            stored_fp = profile.layout_fingerprint_json or {}

            stored_doc_type = self._norm_doc_type(stored_fp.get("document_type"))
            stored_src_fmt = self._norm_source_format(stored_fp.get("source_format"))

            # Strong filter by doc type and source format
            if stored_doc_type != doc_type:
                continue
            if stored_src_fmt not in {"", "UNKNOWN"} and stored_src_fmt != src_fmt:
                continue

            textual_score = layout_clustering_service.calculate_similarity(
                current_fp, stored_fp
            )

            stored_learned = profile.learned_mapping_json or {}
            stored_mappings = (
                stored_learned.get("mappings", [])
                if isinstance(stored_learned, dict)
                else []
            )

            stored_visual = visual_layout_clustering_service.build_visual_signature(
                stored_mappings
            )

            visual_score = 0.0
            if (
                current_visual.get("field_count", 0) > 0
                and stored_visual.get("field_count", 0) > 0
            ):
                visual_score = visual_layout_clustering_service.compare_visual_signatures(
                    current_visual, stored_visual
                )

            if visual_score > 0:
                total_score = round((textual_score * 0.45) + (visual_score * 0.55), 2)
                match_type = "TEXTUAL_PLUS_VISUAL"
                layout_type = visual_layout_clustering_service.classify_visual_match(
                    visual_score
                )
            else:
                total_score = textual_score
                match_type = "TEXTUAL_ONLY"
                layout_type = layout_clustering_service.classify_layout(textual_score)

            if total_score > best_total:
                best_total = total_score
                best_profile = profile
                best_layout_type = layout_type
                best_match_type = match_type

        if not best_profile:
            return None, "NEW_LAYOUT", 0.0, "NO_PROFILE_MATCH"

        return best_profile, best_layout_type, best_total, best_match_type

    # -----------------------------------
    # UPSERT LEARNING RECORD
    # -----------------------------------
    def upsert_learning_record(
        self,
        db: Session,
        *,
        client_id: str,
        supplier_name: str,
        layout_fingerprint: str,
        learned_mapping_json: list[dict] | dict,
        approved_by: str | None = None,
        confidence: float = 0.99,
        header: dict | None = None,
        items: list[dict] | None = None,
        raw_text: str = "",
        document_type: str = "PO",
        source_format: str = "UNKNOWN",
    ):
        supplier = self._norm_vendor(supplier_name)
        doc_type = self._norm_doc_type(document_type)
        src_fmt = self._norm_source_format(source_format)
        header = header or {}
        items = items or []

        fingerprint_json = self.build_fingerprint(header, items, raw_text)
        fingerprint_json["document_type"] = doc_type
        fingerprint_json["source_format"] = src_fmt
        fingerprint_json["layout_fingerprint"] = layout_fingerprint

        existing = (
            db.query(models.VendorLayoutLearning)
            .filter(models.VendorLayoutLearning.client_id == client_id)
            .filter(models.VendorLayoutLearning.supplier_name == supplier)
            .filter(models.VendorLayoutLearning.fingerprint_hash == layout_fingerprint)
            .first()
        )

        if existing:
            existing.learned_mapping_json = (
                learned_mapping_json
                if isinstance(learned_mapping_json, dict)
                else {"mappings": learned_mapping_json}
            )
            existing.layout_fingerprint_json = fingerprint_json
            existing.updated_at = datetime.utcnow()
            existing.last_used_at = datetime.utcnow()
            existing.is_active = True
            if approved_by:
                existing.approved_by = self._as_uuid_or_none(approved_by)
                existing.approved_at = datetime.utcnow()
            db.add(existing)
            return existing

        row = models.VendorLayoutLearning(
            client_id=client_id,
            supplier_name=supplier,
            mapping_profile_name=f"{supplier or client_id}_{doc_type}_{src_fmt}",
            fingerprint_hash=layout_fingerprint,
            layout_fingerprint_json=fingerprint_json,
            learned_mapping_json=(
                learned_mapping_json
                if isinstance(learned_mapping_json, dict)
                else {"mappings": learned_mapping_json}
            ),
            usage_count=0,
            is_active=True,
            created_by=self._norm_str(approved_by) or None,
            approved_by=self._as_uuid_or_none(approved_by),
            approved_at=datetime.utcnow() if approved_by else None,
            message_type=doc_type,
            template_version=1,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            last_used_at=datetime.utcnow(),
        )

        db.add(row)
        return row

    # -----------------------------------
    # LEARN FROM APPROVED PURCHASE ORDER
    # -----------------------------------
    def learn_from_purchase_order(
        self,
        db: Session,
        po,
        *,
        approved_by: str | None = None,
        only_when_corrected: bool = True,
    ):
        if not po:
            return None

        if only_when_corrected:
            status_val = self._norm_str(getattr(po, "status", "")).upper()
            if status_val not in {"CORRECTED", "PROCESSED", "SUCCESS", "REPROCESSED"}:
                return None

        mappings_json = getattr(po, "mappings_json", None) or []
        validation_json = self._build_default_validation_requirements_from_po(po)

        learning_party = self.build_learning_party_key(
            getattr(po, "sender", None),
            getattr(po, "receiver", None),
        )
        if not learning_party:
            return None

        learned_mapping_json = {
            "mappings": mappings_json,
            "validation": validation_json,
            "learned_required_fields": list((validation_json or {}).get("field_requirements") or []),
        }

        layout_fingerprint = self._build_layout_fingerprint_from_mappings(mappings_json)

        header = {
            "document_number": getattr(po, "po_number", None),
            "document_date": str(getattr(po, "po_date", "") or ""),
            "customer_name": getattr(po, "sender", None),
            "supplier_name": getattr(po, "receiver", None),
            "document_type": getattr(po, "po_type", None) or "PO",
            "currency": getattr(po, "currency", None),
            "sold_to": getattr(po, "sold_to", None),
            "ship_to": getattr(po, "ship_to", None),
        }

        item_list = []
        for item in getattr(po, "items", []) or []:
            item_list.append(
                {
                    "line_no": getattr(item, "line_no", None),
                    "material_code": getattr(item, "material_code", None),
                    "description": getattr(item, "description", None),
                    "quantity": getattr(item, "quantity", None),
                    "uom": getattr(item, "uom", None),
                    "unit_price": getattr(item, "unit_price", None),
                    "amount": getattr(item, "amount", None),
                    "delivery_date": str(getattr(item, "delivery_date", "") or ""),
                }
            )

        return self.upsert_learning_record(
            db=db,
            client_id=po.client_id,
            supplier_name=learning_party,
            layout_fingerprint=layout_fingerprint,
            learned_mapping_json=learned_mapping_json,
            approved_by=approved_by,
            confidence=0.99,
            header=header,
            items=item_list,
            raw_text=getattr(po, "raw_text", "") or "",
            document_type=getattr(po, "po_type", None) or "PO",
            source_format=getattr(po, "source_type", None) or "UNKNOWN",
        )

    

    # -----------------------------------
    # LEARN FROM CORRECTED PURCHASE ORDER
    # -----------------------------------

    def learn_corrected_fields_from_purchase_order(
        self,
        db: Session,
        po,
        *,
        approved_by: str | None = None,
        previous_mappings: list[dict] | None = None,
    ):
        if not po:
            return None

        current_mappings = getattr(po, "mappings_json", None) or []
        if not current_mappings:
            return None

        previous_mappings = previous_mappings or []
        previous_map = {
            m.get("key"): m
            for m in previous_mappings
            if isinstance(m, dict) and m.get("key")
        }

        learnable_prefixes = {
            "document_number",
            "document_date",
            "currency_code",
            "ship_to_code",
        }

        learnable_item_suffixes = {
            "line_no",
            "material_code",
            "quantity",
            "customer_uom",
            "unit_price",
            "amount",
            "delivery_date",
        }

        filtered_mappings: list[dict] = []

        for m in current_mappings:
            if not isinstance(m, dict):
                continue

            key = m.get("key")
            if not key:
                continue

            bbox = m.get("bbox")
            value = m.get("value")

            if not bbox:
                continue

            is_header_learnable = key in learnable_prefixes

            is_item_learnable = False
            if key.startswith("items."):
                parts = key.split(".")
                if len(parts) >= 3 and parts[2] in learnable_item_suffixes:
                    is_item_learnable = True

            if not (is_header_learnable or is_item_learnable):
                continue

            old = previous_map.get(key)

            # Learn if new bbox/value was added or changed
            changed = False
            if not old:
                changed = True
            else:
                if old.get("bbox") != bbox:
                    changed = True
                elif str(old.get("value") or "") != str(value or ""):
                    changed = True

            if changed:
                filtered_mappings.append(
                    {
                        "key": key,
                        "value": value,
                        "bbox": bbox,
                    }
                )

        if not filtered_mappings:
            return None

        learning_party = self.build_learning_party_key(
            getattr(po, "sender", None),
            getattr(po, "receiver", None),
        )
        if not learning_party:
            return None

        layout_fingerprint = self._build_layout_fingerprint_from_mappings(current_mappings)

        header = {
            "document_number": getattr(po, "po_number", None),
            "document_date": str(getattr(po, "po_date", "") or ""),
            "customer_name": getattr(po, "sender", None),
            "supplier_name": getattr(po, "receiver", None),
            "document_type": getattr(po, "po_type", None) or "PO",
            "currency": getattr(po, "currency", None),
            "sold_to": getattr(po, "sold_to", None),
            "ship_to": getattr(po, "ship_to", None),
        }

        item_list = []
        for item in getattr(po, "items", []) or []:
            item_list.append(
                {
                    "line_no": getattr(item, "line_no", None),
                    "material_code": getattr(item, "material_code", None),
                    "description": getattr(item, "description", None),
                    "quantity": getattr(item, "quantity", None),
                    "uom": getattr(item, "uom", None),
                    "unit_price": getattr(item, "unit_price", None),
                    "amount": getattr(item, "amount", None),
                    "delivery_date": str(getattr(item, "delivery_date", "") or ""),
                }
            )

        return self.upsert_learning_record(
            db=db,
            client_id=po.client_id,
            supplier_name=learning_party,
            layout_fingerprint=layout_fingerprint,
            learned_mapping_json={"mappings": filtered_mappings},
            approved_by=approved_by,
            confidence=0.99,
            header=header,
            items=item_list,
            raw_text=getattr(po, "raw_text", "") or "",
            document_type=getattr(po, "po_type", None) or "PO",
            source_format=getattr(po, "source_type", None) or "UNKNOWN",
        )

    # -----------------------------------
    # INTERNAL LAYOUT FINGERPRINT
    # -----------------------------------
    def _build_layout_fingerprint_from_mappings(self, mappings_json: list[dict]) -> str:
        simplified = []

        for m in mappings_json or []:
            bbox = m.get("bbox")
            if not bbox:
                continue

            simplified.append(
                (
                    round(float(bbox.get("x", 0) or 0), 4),
                    round(float(bbox.get("y", 0) or 0), 4),
                    round(float(bbox.get("width", 0) or 0), 4),
                    round(float(bbox.get("height", 0) or 0), 4),
                    int(bbox.get("page", 1) or 1),
                )
            )

        simplified.sort()
        raw = json.dumps(simplified, sort_keys=True).encode()
        return hashlib.md5(raw).hexdigest()


vendor_learning_service = VendorLearningService()
