from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class ValidationCheck:
    name: str
    status: str
    message: str


def _to_float(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        return float(value)
    except Exception:
        return None


def validate_purchase_order_payload(parsed_data: dict) -> dict:
    header = parsed_data.get("header", {}) or {}
    items = parsed_data.get("items", []) or []

    checks: list[ValidationCheck] = []

    po_number = str(header.get("po_number") or "").strip()
    po_date = str(header.get("po_date") or "").strip()
    customer = str(header.get("supplier") or header.get("customer") or "").strip()
    currency = str(header.get("currency") or "").strip()

    checks.append(
        ValidationCheck(
            name="po_number",
            status="PASS" if po_number else "FAIL",
            message="PO number found" if po_number else "PO number missing",
        )
    )

    checks.append(
        ValidationCheck(
            name="po_date",
            status="PASS" if po_date else "WARN",
            message="PO date found" if po_date else "PO date missing",
        )
    )

    checks.append(
        ValidationCheck(
            name="customer",
            status="PASS" if customer else "WARN",
            message="Customer found" if customer else "Customer missing",
        )
    )

    checks.append(
        ValidationCheck(
            name="currency",
            status="PASS" if currency else "WARN",
            message="Currency found" if currency else "Currency missing",
        )
    )

    checks.append(
        ValidationCheck(
            name="items_exist",
            status="PASS" if len(items) > 0 else "FAIL",
            message=f"{len(items)} line item(s) found" if len(items) > 0 else "No line items found",
        )
    )

    for idx, item in enumerate(items, start=1):
        material = str(item.get("material") or item.get("material_code") or "").strip()
        description = str(item.get("description") or "").strip()
        quantity = _to_float(item.get("quantity"))
        unit_price = _to_float(item.get("unit_price") or item.get("price"))
        amount = _to_float(item.get("amount"))

        if not material and not description:
            checks.append(
                ValidationCheck(
                    name=f"item_{idx}_identity",
                    status="FAIL",
                    message=f"Line {idx}: material and description both missing",
                )
            )
        else:
            checks.append(
                ValidationCheck(
                    name=f"item_{idx}_identity",
                    status="PASS",
                    message=f"Line {idx}: item identity found",
                )
            )

        if quantity is None or quantity <= 0:
            checks.append(
                ValidationCheck(
                    name=f"item_{idx}_quantity",
                    status="FAIL",
                    message=f"Line {idx}: invalid quantity",
                )
            )
        else:
            checks.append(
                ValidationCheck(
                    name=f"item_{idx}_quantity",
                    status="PASS",
                    message=f"Line {idx}: valid quantity",
                )
            )

        if unit_price is None:
            checks.append(
                ValidationCheck(
                    name=f"item_{idx}_unit_price",
                    status="WARN",
                    message=f"Line {idx}: unit price missing or invalid",
                )
            )
        else:
            checks.append(
                ValidationCheck(
                    name=f"item_{idx}_unit_price",
                    status="PASS",
                    message=f"Line {idx}: valid unit price",
                )
            )

        if quantity is not None and unit_price is not None and amount is not None:
            expected = round(quantity * unit_price, 2)
            actual = round(amount, 2)
            if abs(expected - actual) > 0.05:
                checks.append(
                    ValidationCheck(
                        name=f"item_{idx}_amount_match",
                        status="WARN",
                        message=f"Line {idx}: amount mismatch; expected {expected}, actual {actual}",
                    )
                )
            else:
                checks.append(
                    ValidationCheck(
                        name=f"item_{idx}_amount_match",
                        status="PASS",
                        message=f"Line {idx}: amount matches",
                    )
                )

    fail_count = sum(1 for c in checks if c.status == "FAIL")
    warn_count = sum(1 for c in checks if c.status == "WARN")

    if fail_count == 0 and warn_count == 0:
        severity = "HIGH"
        is_valid = True
    elif fail_count == 0:
        severity = "MEDIUM"
        is_valid = True
    else:
        severity = "LOW"
        is_valid = False

    return {
        "is_valid": is_valid,
        "severity": severity,
        "fail_count": fail_count,
        "warn_count": warn_count,
        "checks": [c.__dict__ for c in checks],
    }