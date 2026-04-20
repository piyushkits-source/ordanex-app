from __future__ import annotations

from typing import Any


def _build_issue(
    *,
    severity: str,
    area: str,
    field: str,
    line_no: int | None,
    current_value: Any,
    recommendation: str,
    action: str,
) -> dict:
    return {
        "severity": severity,
        "area": area,
        "field": field,
        "line_no": line_no,
        "current_value": current_value,
        "recommendation": recommendation,
        "action": action,
        "confidence": "HIGH" if severity == "BLOCKER" else "MEDIUM",
        "source": "AI/Rules",
    }


def evaluate_document(po: dict) -> dict:
    issues = []
    blockers = []
    reviews = []

    header_currency = po.get("currency")
    header_ship_to = po.get("ship_to")
    items = po.get("items", []) or []

    for item in items:
        line_no = item.get("line_no")
        material = item.get("material_code") or item.get("material")
        qty = item.get("quantity")
        uom = item.get("uom")
        desc = item.get("description")
        unit_price = item.get("unit_price")
        amount = item.get("amount")
        delivery_date = item.get("delivery_date")

        if not material:
            issue = _build_issue(
                severity="BLOCKER",
                area="Item",
                field="material",
                line_no=line_no,
                current_value=None,
                recommendation="Provide valid material code",
                action="Fix material before processing",
            )
            issues.append(issue)
            blockers.append(issue)

        if qty in (None, "", 0):
            issue = _build_issue(
                severity="BLOCKER",
                area="Item",
                field="quantity",
                line_no=line_no,
                current_value=qty,
                recommendation="Provide valid quantity",
                action="Fix quantity before processing",
            )
            issues.append(issue)
            blockers.append(issue)

        if not desc:
            issue = _build_issue(
                severity="REVIEW",
                area="Item",
                field="description",
                line_no=line_no,
                current_value=None,
                recommendation="Description is recommended",
                action="Review for completeness",
            )
            issues.append(issue)
            reviews.append(issue)

        if not uom:
            issue = _build_issue(
                severity="REVIEW",
                area="Item",
                field="uom",
                line_no=line_no,
                current_value=None,
                recommendation="Default UOM may be applied",
                action="Confirm unit of measure",
            )
            issues.append(issue)
            reviews.append(issue)

        if not delivery_date:
            issue = _build_issue(
                severity="REVIEW",
                area="Item",
                field="delivery_date",
                line_no=line_no,
                current_value=None,
                recommendation="Fallback to PO date or rule-based lead time",
                action="Confirm delivery date",
            )
            issues.append(issue)
            reviews.append(issue)

        try:
            if qty and unit_price and amount:
                calc = round(float(qty) * float(unit_price), 2)
                if abs(calc - float(amount)) > 1.0:
                    issue = _build_issue(
                        severity="REVIEW",
                        area="Item",
                        field="amount",
                        line_no=line_no,
                        current_value=amount,
                        recommendation=f"Expected approx {calc}",
                        action="Verify pricing",
                    )
                    issues.append(issue)
                    reviews.append(issue)
        except Exception:
            pass

    if not header_currency:
        issue = _build_issue(
            severity="REVIEW",
            area="Header",
            field="currency",
            line_no=None,
            current_value=None,
            recommendation="Provide ISO currency code",
            action="Confirm currency",
        )
        issues.append(issue)
        reviews.append(issue)

    if not header_ship_to:
        issue = _build_issue(
            severity="REVIEW",
            area="Header",
            field="ship_to",
            line_no=None,
            current_value=None,
            recommendation="Apply approved default ship-to or review",
            action="Confirm ship-to",
        )
        issues.append(issue)
        reviews.append(issue)

    if blockers:
        decision = "BLOCKED"
        message = "Critical issues must be fixed before release."
    elif reviews:
        decision = "REVIEW REQUIRED"
        message = "Review recommended before release."
    else:
        decision = "READY"
        message = "Document is ready for downstream processing."

    return {
        "blockers": blockers,
        "reviews": reviews,
        "issues": issues,
        "decision": decision,
        "message": message,
    }
