from __future__ import annotations

import os
import pandas as pd

# IMPORT YOUR EXISTING PARSER FILE
# 👉 adjust filename if different
from backend.services.po_parser_hybrid import parse_pdf_ai_structured


def parse_file_smart(file):
    """
    Universal parser entry point used by worker.

    Returns:
    - header dict
    - items dataframe
    - vendor
    """

    filename = getattr(file, "name", "unknown").lower()

    # ---------------------------------------------------
    # PDF
    # ---------------------------------------------------
    if filename.endswith(".pdf"):
        result = parse_pdf_ai_structured(file)

        header = result.get("header", {})
        items = result.get("items", [])

        df = pd.DataFrame(items)

        vendor = header.get("vendor") or header.get("supplier") or "default"

        return header, df, vendor

    # ---------------------------------------------------
    # Excel
    # ---------------------------------------------------
    elif filename.endswith(".xlsx") or filename.endswith(".xls"):
        df = pd.read_excel(file)

        header = {
            "po_number": "EXCEL_UPLOAD",
            "vendor": "excel",
        }

        return header, df, "excel"

    # ---------------------------------------------------
    # CSV
    # ---------------------------------------------------
    elif filename.endswith(".csv"):
        df = pd.read_csv(file)

        header = {
            "po_number": "CSV_UPLOAD",
            "vendor": "csv",
        }

        return header, df, "csv"

    # ---------------------------------------------------
    # Unsupported
    # ---------------------------------------------------
    else:
        raise ValueError(f"Unsupported file type: {filename}")