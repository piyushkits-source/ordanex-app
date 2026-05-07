from typing import Any
from backend.services.vendor_learning_service import vendor_learning_service

class AutoDetectionService:
    def detect_document(self, db, *, client_id: str, sender_name: str | None,
                        document_type: str, source_format: str,
                        raw_text: str, header: dict, items: list[dict],
                        current_mappings: list[dict] | None = None) -> dict[str, Any]:

        current_mappings = current_mappings or []
        learning_party = vendor_learning_service.build_learning_party_key(
            sender_name,
            header.get("supplier_name") or header.get("supplier") or header.get("vendor"),
        )

        vendor_profile, layout_type, similarity, match_type = (
            vendor_learning_service.get_best_learning_for_vendor(
                db,
                client_id=client_id,
                supplier_name=learning_party,
                header=header,
                items=items,
                raw_text=raw_text,
                current_mappings=current_mappings,
                document_type=document_type,
                source_format=source_format,
            )
        )

        if vendor_profile and similarity >= 0.75:
            learned = getattr(vendor_profile, "learned_mapping_json", {}) or {}
            return {
                "mode": "VENDOR_LEARNING",
                "confidence": 0.95,
                "mappings": learned.get("mappings", []),
            }

        return {
            "mode": "RULE_BASED",
            "confidence": 0.6,
            "mappings": []
        }

auto_detection_service = AutoDetectionService()
