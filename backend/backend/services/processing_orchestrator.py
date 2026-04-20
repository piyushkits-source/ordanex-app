from __future__ import annotations

from backend.services.vendor_learning_service import vendor_learning_service
from backend.services.vendor_confidence_service import vendor_confidence_service
from backend.services.zero_touch_policy_service import zero_touch_policy_service


def process_document(
    db,
    *,
    client_id,
    supplier_name,
    header_dict,
    items,
    raw_text,
    source_format="UNKNOWN",
    document_type="PO",
):
    # -----------------------------
    # 1. LOAD VENDOR PROFILE
    # For inbound PO learning, supplier_name here is actually
    # the customer/sender identity passed from upload_orchestrator.
    # -----------------------------
    vendor_profile, layout_type, similarity, match_type = (
        vendor_learning_service.get_best_learning_for_vendor(
            db,
            client_id=client_id,
            supplier_name=supplier_name,
            header=header_dict,
            items=items,
            raw_text=raw_text,
            current_mappings=[],
            document_type=document_type,
            source_format=source_format,
        )
    )

    # -----------------------------
    # 2. CONFIDENCE
    # -----------------------------
    confidence = vendor_confidence_service.evaluate(
        vendor_learning=vendor_profile,
        supplier_name=supplier_name,
        document_type=document_type,
        source_format=source_format,
        header_dict=header_dict,
        items=items,
        validation_result={"fails": 0, "warns": 0},
    )

    confidence["layout_similarity"] = similarity
    confidence["layout_type"] = layout_type
    confidence["layout_match_type"] = match_type

    # -----------------------------
    # 3. POLICY
    # -----------------------------
    policy = zero_touch_policy_service.can_auto_process(
        confidence_result=confidence,
        vendor_profile=vendor_profile,
    )

    # Prevent zero-touch for weak or unseen layouts
    if layout_type in [
        "VISUAL_NEW_LAYOUT",
        "NEW_LAYOUT",
        "PARTIAL_MATCH",
        "VISUAL_PARTIAL_MATCH",
    ]:
        policy["zero_touch"] = False
        policy["final_action"] = "MANUAL_REVIEW_REQUIRED"

    # -----------------------------
    # 4. APPLY LEARNING
    # learned_mapping_json is expected like:
    # {
    #   "mappings": [
    #       {"key": "po_number", "bbox": {...}},
    #       ...
    #   ]
    # }
    # -----------------------------
    if vendor_profile and confidence["score"] >= 75:
        learned = getattr(vendor_profile, "learned_mapping_json", None) or {}
        mappings = learned.get("mappings", []) if isinstance(learned, dict) else []

        bbox_map = {
            m["key"]: m["bbox"]
            for m in mappings
            if isinstance(m, dict) and m.get("key") and m.get("bbox")
        }
    else:
        bbox_map = {}

    # -----------------------------
    # 5. RESULT
    # -----------------------------
    result = {
        "vendor_profile": vendor_profile,
        "layout_type": layout_type,
        "layout_similarity": similarity,
        "layout_match_type": match_type,
        "confidence_score": confidence["score"],
        "confidence_action": confidence["action"],
        "trust_level": policy["trust_level"],
        "action": policy["final_action"],
        "zero_touch": policy["zero_touch"],
        "bbox_map": bbox_map,
        "reasons": confidence["reasons"],
        "document_type": document_type,
        "source_format": source_format,
    }

    return result