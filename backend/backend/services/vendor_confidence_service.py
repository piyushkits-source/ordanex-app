from __future__ import annotations

from typing import Any


class VendorConfidenceService:
    def evaluate(
        self,
        *,
        vendor_learning: dict | None,
        supplier_name: str | None,
        document_type: str,
        source_format: str,
        header_dict: dict,
        items: list[dict],
        validation_result: dict | None = None,
    ) -> dict:
        score = 0
        reasons: list[str] = []
        hard_stop = False

        # 1. Vendor / learning confidence
        if vendor_learning:
            approved_count = int(getattr(vendor_learning, "approved_count", 0) or 0)
            usage_count = int(getattr(vendor_learning, "usage_count", 0) or 0)

            if approved_count >= 10:
                score += 25
                reasons.append("Vendor profile has high approved history")
            elif approved_count >= 3:
                score += 18
                reasons.append("Vendor profile has moderate approved history")
            elif approved_count >= 1:
                score += 10
                reasons.append("Vendor profile exists but is still learning")

            if usage_count >= 20:
                score += 10
                reasons.append("Layout reused frequently")
            elif usage_count >= 5:
                score += 6
                reasons.append("Layout reused several times")

        # 2. Header confidence
        po_number = str(header_dict.get("po_number", "") or "").strip()
        po_date = str(header_dict.get("po_date", "") or "").strip()
        currency = str(header_dict.get("currency", "") or "").strip()

        if po_number:
            score += 15
        else:
            hard_stop = True
            reasons.append("Missing PO number")

        if po_date:
            score += 8
        else:
            reasons.append("Missing PO date")

        if currency:
            score += 4

        # 3. Line-item confidence
        if items and len(items) > 0:
            score += 15
        else:
            hard_stop = True
            reasons.append("No line items extracted")

        valid_item_count = 0
        for item in items:
            material = str(item.get("material_code", "") or item.get("material", "") or "").strip()
            qty = item.get("quantity")
            desc = str(item.get("description", "") or "").strip()

            if material:
                valid_item_count += 1
            elif desc:
                valid_item_count += 0.5

            if qty is not None:
                try:
                    if float(qty) <= 0:
                        hard_stop = True
                        reasons.append("Invalid quantity detected")
                except Exception:
                    reasons.append("Quantity parse issue")

        if items:
            ratio = valid_item_count / max(len(items), 1)
            if ratio >= 0.9:
                score += 15
                reasons.append("Line items extracted cleanly")
            elif ratio >= 0.6:
                score += 8
                reasons.append("Line items partially reliable")
            else:
                reasons.append("Weak line-item extraction")

        # 4. Validation confidence
        if validation_result:
            fails = int(validation_result.get("fails", 0) or 0)
            warns = int(validation_result.get("warns", 0) or 0)

            if fails > 0:
                hard_stop = True
                reasons.append("Validation failures present")
            elif warns == 0:
                score += 8
                reasons.append("Validation clean")
            else:
                score += 3
                reasons.append("Validation warnings only")

        # Clamp score
        score = max(0, min(100, score))

        # Decide action
        if hard_stop:
            action = "BLOCKED"
        elif score >= 90:
            action = "AUTO_APPLY_AND_PROCESS"
        elif score >= 75:
            action = "AUTO_APPLY_REVIEW_REQUIRED"
        elif score >= 50:
            action = "MANUAL_REVIEW_REQUIRED"
        else:
            action = "BLOCKED"

        return {
            "score": score,
            "action": action,
            "hard_stop": hard_stop,
            "reasons": reasons,
        }


vendor_confidence_service = VendorConfidenceService()