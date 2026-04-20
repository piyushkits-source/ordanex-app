from __future__ import annotations

import io
from dataclasses import dataclass, field
from typing import Any

from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.worksheet.worksheet import Worksheet


ERROR_FILL = PatternFill(start_color="FECACA", end_color="FECACA", fill_type="solid")
HEADER_FILL = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid")
ERROR_FONT = Font(color="B91C1C", bold=True)


@dataclass
class ValidationIssue:
    row_number: int
    column_name: str
    message: str


@dataclass
class ValidationResult:
    is_valid: bool
    parsed_rows: list[dict[str, Any]] = field(default_factory=list)
    issues: list[ValidationIssue] = field(default_factory=list)
    workbook_bytes: bytes | None = None


def _normalize_headers(ws: Worksheet) -> dict[str, int]:
    headers: dict[str, int] = {}
    for idx, cell in enumerate(ws[1], start=1):
        value = str(cell.value).strip() if cell.value is not None else ""
        if value:
            headers[value] = idx
    return headers


def _ensure_error_column(ws: Worksheet) -> int:
    max_col = ws.max_column
    header_names = [str(c.value).strip() if c.value else "" for c in ws[1]]
    if "error_message" in header_names:
        return header_names.index("error_message") + 1

    new_col = max_col + 1
    ws.cell(row=1, column=new_col, value="error_message")
    ws.cell(row=1, column=new_col).fill = HEADER_FILL
    ws.cell(row=1, column=new_col).font = ERROR_FONT
    return new_col


def _append_error(ws: Worksheet, row_num: int, error_col: int, message: str) -> None:
    cell = ws.cell(row=row_num, column=error_col)
    existing = str(cell.value).strip() if cell.value else ""
    cell.value = f"{existing}; {message}" if existing else message
    cell.fill = ERROR_FILL
    cell.font = ERROR_FONT


def _mark_cell_error(ws: Worksheet, row_num: int, col_num: int) -> None:
    cell = ws.cell(row=row_num, column=col_num)
    cell.fill = ERROR_FILL


def _workbook_to_bytes(wb) -> bytes:
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()


def validate_uom_workbook(contents: bytes) -> ValidationResult:
    wb = load_workbook(filename=io.BytesIO(contents))
    if "UOM_Data" not in wb.sheetnames:
        return ValidationResult(
            is_valid=False,
            issues=[ValidationIssue(0, "sheet", "Sheet 'UOM_Data' not found.")],
            workbook_bytes=_workbook_to_bytes(wb),
        )

    ws = wb["UOM_Data"]
    headers = _normalize_headers(ws)
    error_col = _ensure_error_column(ws)

    required = [
        "client_id",
        "input_uom",
        "output_uom",
        "factor",
        "rounding_digits",
        "rounding_mode",
        "is_active",
    ]

    missing_headers = [h for h in required if h not in headers]
    if missing_headers:
        for header in missing_headers:
            _append_error(ws, 2, error_col, f"Missing header: {header}")
        return ValidationResult(
            is_valid=False,
            issues=[ValidationIssue(0, h, "Missing required header.") for h in missing_headers],
            workbook_bytes=_workbook_to_bytes(wb),
        )

    valid_rounding = {"HALF_UP", "FLOOR", "CEILING"}
    valid_active = {"TRUE", "FALSE", "YES", "NO", "1", "0"}

    parsed_rows: list[dict[str, Any]] = []
    issues: list[ValidationIssue] = []

    for row_num in range(2, ws.max_row + 1):
        row_data = {}
        has_any_value = False

        for header, col_num in headers.items():
            value = ws.cell(row=row_num, column=col_num).value
            row_data[header] = value
            if value not in (None, ""):
                has_any_value = True

        if not has_any_value:
            continue

        row_errors: list[tuple[str, str]] = []

        for field in required:
            if row_data.get(field) in (None, ""):
                row_errors.append((field, f"{field} is required."))

        factor = row_data.get("factor")
        if factor not in (None, ""):
            try:
                float(factor)
            except Exception:
                row_errors.append(("factor", "factor must be numeric."))

        divider = row_data.get("divider")
        if divider not in (None, ""):
            try:
                float(divider)
            except Exception:
                row_errors.append(("divider", "divider must be numeric."))

        rounding_digits = row_data.get("rounding_digits")
        if rounding_digits not in (None, ""):
            try:
                int(rounding_digits)
            except Exception:
                row_errors.append(("rounding_digits", "rounding_digits must be an integer."))

        rounding_mode = str(row_data.get("rounding_mode") or "").strip().upper()
        if rounding_mode and rounding_mode not in valid_rounding:
            row_errors.append(("rounding_mode", "Invalid rounding_mode."))

        is_active = str(row_data.get("is_active") or "").strip().upper()
        if is_active and is_active not in valid_active:
            row_errors.append(("is_active", "Invalid is_active value."))

        if row_errors:
            for column_name, message in row_errors:
                issues.append(ValidationIssue(row_num, column_name, message))
                if column_name in headers:
                    _mark_cell_error(ws, row_num, headers[column_name])
                _append_error(ws, row_num, error_col, message)
            continue

        parsed_rows.append(
            {
                "client_id": str(row_data.get("client_id")).strip(),
                "partner_id": str(row_data.get("partner_id")).strip() if row_data.get("partner_id") else None,
                "input_uom": str(row_data.get("input_uom")).strip().upper(),
                "output_uom": str(row_data.get("output_uom")).strip().upper(),
                "factor": float(row_data.get("factor")),
                "divider": float(row_data.get("divider")) if row_data.get("divider") not in (None, "") else 1.0,
                "material_code": str(row_data.get("material_code")).strip() if row_data.get("material_code") else None,
                "rounding_digits": int(row_data.get("rounding_digits")),
                "rounding_mode": rounding_mode,
                "is_active": is_active in {"TRUE", "YES", "1"},
            }
        )

    is_valid = len(issues) == 0
    return ValidationResult(
        is_valid=is_valid,
        parsed_rows=parsed_rows,
        issues=issues,
        workbook_bytes=None if is_valid else _workbook_to_bytes(wb),
    )


def validate_bulk_onboarding_workbook(contents: bytes) -> ValidationResult:
    wb = load_workbook(filename=io.BytesIO(contents))
    if "Bulk_Onboarding" not in wb.sheetnames:
        return ValidationResult(
            is_valid=False,
            issues=[ValidationIssue(0, "sheet", "Sheet 'Bulk_Onboarding' not found.")],
            workbook_bytes=_workbook_to_bytes(wb),
        )

    ws = wb["Bulk_Onboarding"]
    headers = _normalize_headers(ws)
    error_col = _ensure_error_column(ws)

    required = [
        "client_id",
        "vertical_id",
        "partner_code",
        "partner_name",
        "partner_type",
        "status",
        "connection_method",
    ]

    missing_headers = [h for h in required if h not in headers]
    if missing_headers:
        for header in missing_headers:
            _append_error(ws, 2, error_col, f"Missing header: {header}")
        return ValidationResult(
            is_valid=False,
            issues=[ValidationIssue(0, h, "Missing required header.") for h in missing_headers],
            workbook_bytes=_workbook_to_bytes(wb),
        )

    valid_partner_type = {"CUSTOMER", "SUPPLIER", "LOGISTICS_PROVIDER"}
    valid_status = {"ACTIVE", "INACTIVE"}
    valid_connection = {"EMAIL", "EDI", "SFTP", "AS2", "API"}

    parsed_rows: list[dict[str, Any]] = []
    issues: list[ValidationIssue] = []

    for row_num in range(2, ws.max_row + 1):
        row_data = {}
        has_any_value = False

        for header, col_num in headers.items():
            value = ws.cell(row=row_num, column=col_num).value
            row_data[header] = value
            if value not in (None, ""):
                has_any_value = True

        if not has_any_value:
            continue

        row_errors: list[tuple[str, str]] = []

        for field in required:
            if row_data.get(field) in (None, ""):
                row_errors.append((field, f"{field} is required."))

        partner_type = str(row_data.get("partner_type") or "").strip().upper()
        if partner_type and partner_type not in valid_partner_type:
            row_errors.append(("partner_type", "Invalid partner_type."))

        status = str(row_data.get("status") or "").strip().upper()
        if status and status not in valid_status:
            row_errors.append(("status", "Invalid status."))

        connection_method = str(row_data.get("connection_method") or "").strip().upper()
        if connection_method and connection_method not in valid_connection:
            row_errors.append(("connection_method", "Invalid connection_method."))

        email = str(row_data.get("email") or "").strip()
        if connection_method == "EMAIL" and not email:
            row_errors.append(("email", "email is required when connection_method is EMAIL."))

        if row_errors:
            for column_name, message in row_errors:
                issues.append(ValidationIssue(row_num, column_name, message))
                if column_name in headers:
                    _mark_cell_error(ws, row_num, headers[column_name])
                _append_error(ws, row_num, error_col, message)
            continue

        parsed_rows.append(
            {
                "client_id": str(row_data.get("client_id")).strip(),
                "vertical_id": str(row_data.get("vertical_id")).strip(),
                "partner_code": str(row_data.get("partner_code")).strip().upper(),
                "partner_name": str(row_data.get("partner_name")).strip(),
                "partner_type": partner_type,
                "status": status,
                "connection_method": connection_method,
                "email": email or None,
                "edi_id": str(row_data.get("edi_id")).strip() if row_data.get("edi_id") else None,
                "sftp_path": str(row_data.get("sftp_path")).strip() if row_data.get("sftp_path") else None,
                "as2_id": str(row_data.get("as2_id")).strip() if row_data.get("as2_id") else None,
                "api_reference": str(row_data.get("api_reference")).strip() if row_data.get("api_reference") else None,
                "notes": str(row_data.get("notes")).strip() if row_data.get("notes") else None,
            }
        )

    is_valid = len(issues) == 0
    return ValidationResult(
        is_valid=is_valid,
        parsed_rows=parsed_rows,
        issues=issues,
        workbook_bytes=None if is_valid else _workbook_to_bytes(wb),
    )