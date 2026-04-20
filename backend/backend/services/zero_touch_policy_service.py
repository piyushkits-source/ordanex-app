from __future__ import annotations


class ZeroTouchPolicyService:
    def can_auto_process(self, *, confidence_result: dict, vendor_profile=None) -> dict:
        score = float(confidence_result.get("score", 0) or 0)

        if score >= 90:
            return {
                "trust_level": "HIGH",
                "final_action": "AUTO_APPLY_AND_PROCESS",
                "zero_touch": True,
            }

        if score >= 75:
            return {
                "trust_level": "MEDIUM",
                "final_action": "AUTO_APPLY_REVIEW_REQUIRED",
                "zero_touch": False,
            }

        return {
            "trust_level": "LOW",
            "final_action": "MANUAL_REVIEW_REQUIRED",
            "zero_touch": False,
        }


zero_touch_policy_service = ZeroTouchPolicyService()