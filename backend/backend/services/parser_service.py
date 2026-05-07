from __future__ import annotations

from email.header import decode_header
import io
import json
import hashlib
from collections import defaultdict
import pandas as pd
import re
import unicodedata

from backend.services.po_parser_hybrid import parse_pdf_ai_structured
from backend.services.parser_registry import get_source_parser


def _decode_mime_filename(filename: str | None) -> str:
    raw = str(filename or "")
    if not raw:
        return "unknown"

    parts: list[str] = []
    for decoded, charset in decode_header(raw):
        if isinstance(decoded, bytes):
            parts.append(decoded.decode(charset or "utf-8", errors="ignore"))
        else:
            parts.append(str(decoded))
    return "".join(parts).strip() or "unknown"


def _read_text_payload(file) -> str:
    file.seek(0)
    data = file.read()
    if isinstance(data, str):
        text = data
    else:
        text = data.decode("utf-8", errors="ignore")
    file.seek(0)
    return text


def _detect_text_format(filename: str, raw_text: str) -> str:
    lower_filename = filename.lower()
    upper = raw_text.upper()
    stripped = raw_text.lstrip()

    if lower_filename.endswith((".xml", ".html", ".htm")) or stripped.startswith("<"):
        return "XML"
    if lower_filename.endswith(".json") or stripped.startswith("{") or stripped.startswith("["):
        return "JSON"
    if "UNB+" in upper or "UNH+" in upper:
        return "EDIFACT"
    if "ISA*" in upper or "GS*" in upper or "ST*" in upper or "ISA~" in upper or "GS~" in upper or "ST~" in upper:
        return "X12"
    return "TEXT"


def _normalize_column_name(value: object) -> str:
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def _promote_header_row(df: pd.DataFrame) -> pd.DataFrame:
    normalized_columns = {_normalize_column_name(c) for c in df.columns}
    header_tokens = {"material", "product", "quantity", "quantidade", "price", "preco", "delivery_date", "data_de_entrega", "unit", "uom"}
    if normalized_columns & header_tokens:
        return df

    sample_window = min(len(df), 8)
    for idx in range(sample_window):
        values = [_normalize_column_name(v) for v in df.iloc[idx].tolist()]
        hits = sum(1 for v in values if v in header_tokens)
        if hits >= 2:
            promoted = df.iloc[idx + 1 :].copy()
            promoted.columns = [str(v or "") for v in df.iloc[idx].tolist()]
            promoted = promoted.reset_index(drop=True)
            return promoted
    return df


def _dataframe_to_text(df: pd.DataFrame) -> str:
    try:
        return df.fillna("").to_csv(index=False)
    except Exception:
        try:
            return df.fillna("").to_string(index=False)
        except Exception:
            return ""


def _clean_placeholder_document_number(value: object) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    if text.upper() in {"EXCEL_UPLOAD", "CSV_UPLOAD", "TEXT_UPLOAD"}:
        return None
    return text


def _looks_like_invoice(header: dict | None, raw_text: str = "") -> bool:
    header = header or {}
    invoice_fields = (
        "invoice_number",
        "invoice_date",
        "billing_document_number",
        "reference_po_number",
        "invoice_total",
        "invoice_amount",
        "due_date",
        "payment_terms",
        "tax_total",
        "freight_total",
    )
    if any(header.get(field) not in [None, ""] for field in invoice_fields):
        return True
    text = (raw_text or header.get("raw_text") or "").lower()
    return any(marker in text for marker in ("invoice", "tax invoice", "commercial invoice", "billing invoice"))


DOCUMENT_FAMILY_ALIASES = {
    "PO": {"PO", "PURCHASE_ORDER", "ORDERS", "850", "ORDER"},
    "ORDER_RESPONSE": {"ORDER_RESPONSE", "ORDRSP", "855", "ACK", "ACKNOWLEDGEMENT", "CONFIRMATION"},
    "ORDER_CHANGE": {"ORDER_CHANGE", "ORDCHG", "860", "CHANGE", "AMENDMENT"},
    "ASN": {"ASN", "DESADV", "856", "ADVANCE SHIP NOTICE", "DELIVERY NOTE", "SHIPMENT NOTICE"},
    "INVOICE": {"INVOICE", "AP_INVOICE", "AR_INVOICE", "INVOIC", "810", "BILL", "BILLING", "COMMERCIAL INVOICE"},
}


def _normalize_document_family(value: object) -> str:
    text = str(value or "").strip().upper()
    if not text:
        return ""
    if text in DOCUMENT_FAMILY_ALIASES["PO"]:
        return "PO"
    if text in DOCUMENT_FAMILY_ALIASES["ORDER_RESPONSE"]:
        return "ORDER_RESPONSE"
    if text in DOCUMENT_FAMILY_ALIASES["ORDER_CHANGE"]:
        return "ORDER_CHANGE"
    if text in DOCUMENT_FAMILY_ALIASES["ASN"]:
        return "ASN"
    if text in DOCUMENT_FAMILY_ALIASES["INVOICE"]:
        return "INVOICE"
    return text


def _infer_document_family(header: dict | None, raw_text: str = "", filename: str = "", detected_format: str = "") -> tuple[str, str]:
    header = header or {}
    explicit_keys = (
        "document_type",
        "message_family",
        "message_type",
        "po_type",
        "order_type",
        "target_message_type",
    )
    for key in explicit_keys:
        family = _normalize_document_family(header.get(key))
        if family in {"PO", "ORDER_RESPONSE", "ORDER_CHANGE", "ASN", "INVOICE"}:
            return family, "EXPLICIT"

    text = " ".join(
        [
            str(filename or ""),
            str(detected_format or ""),
            str(raw_text or ""),
            str(header.get("raw_text") or ""),
            str(header.get("subject") or ""),
            str(header.get("invoice_number") or ""),
            str(header.get("billing_document_number") or ""),
            str(header.get("reference_po_number") or ""),
        ]
    ).upper()

    if any(marker in text for marker in ("INVOICE", "TAX INVOICE", "COMMERCIAL INVOICE", "BILLING INVOICE", "INVOIC", "810")):
        return "INVOICE", "KEYWORD"
    if any(marker in text for marker in ("ORDER RESPONSE", "ORDRSP", "ACKNOWLEDGEMENT", "CONFIRMATION", "ACCEPTED", "REJECTED")):
        return "ORDER_RESPONSE", "KEYWORD"
    if any(marker in text for marker in ("ORDER CHANGE", "ORDCHG", "AMEND", "CHANGE ORDER", "REVISED", "REVISION")):
        return "ORDER_CHANGE", "KEYWORD"
    if any(marker in text for marker in ("ASN", "DESADV", "ADVANCE SHIP NOTICE", "DELIVERY NOTE", "SHIPMENT NOTICE", "SHIP NOTICE")):
        return "ASN", "KEYWORD"
    if any(marker in text for marker in ("ORDER", "PO ", "PURCHASE ORDER", "ORDERS", "850")):
        return "PO", "KEYWORD"

    return "PO", "DEFAULT"


def _apply_document_family_metadata(header: dict | None, *, raw_text: str = "", filename: str = "", detected_format: str = "") -> dict:
    header = dict(header or {})
    family, reason = _infer_document_family(header, raw_text=raw_text, filename=filename, detected_format=detected_format)
    header["document_type"] = family
    header.setdefault("message_family", family)
    header.setdefault("po_type", family)
    if family == "INVOICE":
        header.setdefault("reference_po_number", header.get("po_number") or header.get("document_number"))
        if detected_format.upper() == "X12":
            header.setdefault("message_type", "810")
        elif detected_format.upper() == "EDIFACT":
            header.setdefault("message_type", "INVOIC")
        else:
            header.setdefault("message_type", "INVOICE")
    elif family == "ORDER_RESPONSE":
        header.setdefault("message_type", "ORDRSP")
    elif family == "ORDER_CHANGE":
        header.setdefault("message_type", "ORDCHG")
    elif family == "ASN":
        header.setdefault("message_type", "DESADV")
    else:
        header.setdefault("message_type", "ORDERS")
    header["document_confidence"] = "HIGH" if reason == "EXPLICIT" else "MEDIUM" if reason == "KEYWORD" else "LOW"
    header["document_confidence_reason"] = reason
    return header


def _extract_inline_value(cell_text: str) -> str | None:
    text = str(cell_text or "").strip()
    if not text:
        return None
    if ":" in text:
        _, rhs = text.split(":", 1)
        rhs = rhs.strip()
        if rhs:
            return rhs
    return None


def _infer_tabular_header_metadata(df: pd.DataFrame) -> dict[str, str | None]:
    if df is None or df.empty:
        return {"document_number": None, "document_date": None}

    working = df.fillna("")
    max_rows = min(len(working.index), 12)
    max_cols = min(len(working.columns), 12)
    document_number = None
    document_date = None

    number_labels = ("po number", "po no", "purchase order", "order number", "work id", "contract")
    date_labels = ("po date", "document date", "order date", "report date", "date")

    for row_idx in range(max_rows):
        for col_idx in range(max_cols):
            cell = str(working.iat[row_idx, col_idx] or "").strip()
            if not cell:
                continue
            lower_cell = cell.lower()

            if document_number is None and any(label in lower_cell for label in number_labels):
                candidate = _extract_inline_value(cell)
                if not candidate and col_idx + 1 < max_cols:
                    candidate = str(working.iat[row_idx, col_idx + 1] or "").strip()
                document_number = _clean_placeholder_document_number(candidate)

            if document_date is None and any(label in lower_cell for label in date_labels):
                candidate = _extract_inline_value(cell)
                if not candidate and col_idx + 1 < max_cols:
                    candidate = str(working.iat[row_idx, col_idx + 1] or "").strip()
                document_date = candidate or document_date

    raw_text = _dataframe_to_text(working)
    if document_number is None:
        match = re.search(r"\b(?:PO|P|S)?[A-Z]?\d{6,}[A-Z0-9\-\/]*\b", raw_text, re.IGNORECASE)
        if match:
            document_number = _clean_placeholder_document_number(match.group(0))

    if document_date is None:
        match = re.search(r"\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b", raw_text)
        if match:
            document_date = match.group(0)

    return {
        "document_number": document_number,
        "document_date": document_date,
    }


def _pick_column(columns: list[str], *aliases: str) -> str | None:
    for alias in aliases:
        for col in columns:
            if col == alias:
                return col
    for alias in aliases:
        for col in columns:
            if alias in col:
                return col
    return None


def _normalize_tabular_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame([])

    working = _promote_header_row(df).copy()
    working = working.dropna(how="all")
    working.columns = [str(c or "") for c in working.columns]

    normalized_columns = [_normalize_column_name(c) for c in working.columns]
    column_map = dict(zip(normalized_columns, working.columns))
    normalized_keys = list(column_map.keys())

    line_col = _pick_column(normalized_keys, "seq", "line", "line_no", "line_number")
    material_col = _pick_column(normalized_keys, "material", "product", "item_number", "item", "supplier_product_code")
    description_col = _pick_column(normalized_keys, "descricao", "description", "especificacao", "specification", "details")
    quantity_col = _pick_column(normalized_keys, "quantidade", "quantity", "qty", "ordered_quantity")
    uom_col = _pick_column(normalized_keys, "un", "uom", "unit")
    unit_price_col = _pick_column(normalized_keys, "preco", "price", "unit_price", "net_price")
    amount_col = _pick_column(normalized_keys, "extended_price", "amount", "extension", "net_amount")
    delivery_date_col = _pick_column(normalized_keys, "data_de_entrega", "delivery_date", "requested_delivery_date")

    rows: list[dict] = []
    for idx, record in enumerate(working.fillna("").to_dict(orient="records"), start=1):
        normalized_record = {
            _normalize_column_name(k): ("" if v is None else str(v).strip())
            for k, v in record.items()
        }

        def val(col_key: str | None) -> str:
            if not col_key:
                return ""
            original = column_map.get(col_key)
            if original is not None:
                return str(record.get(original, "") or "").strip()
            return normalized_record.get(col_key, "")

        material = val(material_col)
        description = val(description_col)
        quantity = val(quantity_col)
        uom = val(uom_col)
        unit_price = val(unit_price_col)
        amount = val(amount_col)
        delivery_date = val(delivery_date_col)
        line_no = val(line_col) or str(idx)

        if not any([material, description, quantity, unit_price, amount, delivery_date]):
            continue

        rows.append(
            {
                "line_no": line_no,
                "material_code": material,
                "description": description,
                "quantity": quantity,
                "uom": uom,
                "unit_price": unit_price,
                "amount": amount,
                "delivery_date": delivery_date,
            }
        )

    return pd.DataFrame(rows) if rows else working


def _row_is_blank(values: list[object]) -> bool:
    return all(str(value or "").strip() == "" for value in values)


def _row_to_normalized_map(headers: list[str], values: list[object]) -> dict[str, str]:
    result: dict[str, str] = {}
    for idx, header in enumerate(headers):
        key = _normalize_column_name(header)
        if not key:
            continue
        if idx >= len(values):
            continue
        value = values[idx]
        text = "" if value is None else str(value).strip()
        if text:
            result[key] = text
    return result


def _find_row_index_with_tokens(df: pd.DataFrame, tokens: list[str], max_rows: int = 12) -> int | None:
    normalized_tokens = [_normalize_column_name(token) for token in tokens if token]
    if not normalized_tokens or df is None or df.empty:
        return None

    sample_rows = min(len(df.index), max_rows)
    for row_idx in range(sample_rows):
        values = [_normalize_column_name(v) for v in df.iloc[row_idx].tolist()]
        if any(token in values for token in normalized_tokens):
            return row_idx
    return None


def _parse_two_sheet_workbook_documents(file) -> list[tuple[dict, pd.DataFrame, str]]:
    """
    Handle demo workbook structure where:
    - sheet 1 contains multiple order headers
    - sheet 2 contains line items shared across each order
    """
    try:
        file.seek(0)
        workbook = pd.ExcelFile(file)
    except Exception:
        file.seek(0)
        return []

    if len(workbook.sheet_names) < 2:
        file.seek(0)
        return []

    header_sheet = workbook.sheet_names[0]
    line_sheet = workbook.sheet_names[1]

    header_df = workbook.parse(header_sheet, header=None)
    line_df = workbook.parse(line_sheet, header=None)

    header_row_idx = _find_row_index_with_tokens(header_df, ["SALESORDERNUMBER"])
    line_row_idx = _find_row_index_with_tokens(line_df, ["LINE NUM", "ITEM", "PRICE"])

    if header_row_idx is None or line_row_idx is None:
        file.seek(0)
        return []

    header_columns = [str(v or "").strip() for v in header_df.iloc[header_row_idx].tolist()]
    line_columns = [str(v or "").strip() for v in line_df.iloc[line_row_idx].tolist()]
    line_normalized_keys = [_normalize_column_name(col) for col in line_columns]

    line_items: list[dict] = []
    for idx in range(line_row_idx + 1, len(line_df.index)):
        row_values = line_df.iloc[idx].tolist()
        if _row_is_blank(row_values):
            continue

        row_map = _row_to_normalized_map(line_columns, row_values)
        line_no = row_map.get("line_num") or row_map.get("line_number") or row_map.get("seq") or str(len(line_items) + 1)
        material = (
            row_map.get("item")
            or row_map.get("material")
            or row_map.get("product")
            or row_map.get("item_number")
            or row_map.get("item_code")
        )
        description = (
            row_map.get("description")
            or row_map.get("item_description")
            or row_map.get("details")
            or material
        )
        quantity = row_map.get("quantity") or row_map.get("qty") or row_map.get("ordered_quantity")
        uom = row_map.get("uom") or row_map.get("unit") or row_map.get("customer_uom")
        price = row_map.get("price") or row_map.get("unit_price") or row_map.get("net_price")
        amount = row_map.get("amount") or row_map.get("extended_price") or price
        delivery_date = (
            row_map.get("delivery_date")
            or row_map.get("requested_delivery_date")
            or row_map.get("date")
        )
        ship_to_override = row_map.get("ship_to") or row_map.get("delivery_address") or row_map.get("delivery_address_name")

        if not any([line_no, material, description, quantity, price, amount, delivery_date]):
            continue

        line_items.append(
            {
                "line_no": line_no,
                "material_code": material,
                "buyer_product_code": material,
                "description": description,
                "quantity": quantity,
                "uom": uom,
                "unit_price": price,
                "amount": amount,
                "delivery_date": delivery_date,
                "ship_to_override": ship_to_override,
            }
        )

    if not line_items:
        file.seek(0)
        return []

    split_seed = f"{getattr(file, 'name', 'excel')}|{header_sheet}|{line_sheet}|{len(line_items)}"
    split_key = f"EXCEL-{hashlib.sha1(split_seed.encode('utf-8', errors='ignore')).hexdigest()[:12]}"

    documents: list[tuple[dict, pd.DataFrame, str]] = []
    for row_idx in range(header_row_idx + 2, len(header_df.index)):
        row_values = header_df.iloc[row_idx].tolist()
        if _row_is_blank(row_values):
            continue

        row_map = _row_to_normalized_map(header_columns, row_values)
        document_number = row_map.get("salesordernumber")
        if not document_number:
            continue

        ship_to_name = row_map.get("deliveryaddressname") or row_map.get("shiptoaddressname")
        ship_to_code = row_map.get("shiptoaddresscode") or ship_to_name
        street = row_map.get("deliveryaddressstreet")
        city = row_map.get("deliveryaddresscity")
        zipcode = row_map.get("deliveryaddresszipcode")
        state = row_map.get("deliveryaddressstateid")
        address_parts = [part for part in [street, city, zipcode, state] if part]

        header = {
            "po_number": document_number,
            "document_number": document_number,
            "po_date": row_map.get("orderdate") or row_map.get("documentdate"),
            "document_date": row_map.get("orderdate") or row_map.get("documentdate"),
            "customer_name": row_map.get("orderingcustomeraccountnumber") or ship_to_name or "Customer",
            "supplier_name": row_map.get("invoicecustomeraccountnumber") or ship_to_name or "Supplier",
            "sold_to": row_map.get("orderingcustomeraccountnumber"),
            "ship_to": ship_to_code,
            "ship_to_name": ship_to_name,
            "ship_to_address": ", ".join(address_parts),
            "order_type": row_map.get("sales_origin_code"),
            "document_type": "PO",
            "vendor": "excel",
            "raw_text": _dataframe_to_text(header_df),
            "_split_key": split_key,
            "_split_sequence": len(documents) + 1,
            "_source_locator": {
                "sheet": header_sheet,
                "row_index": row_idx + 1,
                "document_number": document_number,
            },
        }
        documents.append((header, pd.DataFrame(line_items), "excel"))

    if len(documents) <= 1:
        file.seek(0)
        return []

    file.seek(0)
    return documents


def _parse_pdf_multi_documents(file) -> list[tuple[dict, pd.DataFrame, str]]:
    """
    Best-effort PDF splitter for batch files.

    Heuristic:
    - inspect each page independently
    - extract a PO number from each page
    - if multiple distinct PO numbers are found, group pages by PO number
    - each group becomes one logical document

    This keeps single-PO PDFs on the existing path while allowing multi-order
    PDFs to split before Message Monitor row creation.
    """
    try:
        file.seek(0)
        file_bytes = file.read()
        file.seek(0)
    except Exception:
        return []

    if not file_bytes:
        return []

    try:
        from backend.services.po_parser_hybrid import (
            cleanup_extracted_rows,
            detect_header_row,
            extract_header_fields,
            extract_item_rows_from_layout,
            extract_items_from_raw_text,
            extract_pdf_words,
            group_words_into_lines,
            infer_columns_from_lines,
            map_header_words_to_columns,
        )
    except Exception:
        return []

    try:
        pages = extract_pdf_words(file_bytes)
    except Exception:
        return []

    page_docs: list[dict[str, object]] = []
    for page_no, words in pages.items():
        lines = group_words_into_lines(words)
        page_text = "\n".join(line.get("text", "") for line in lines if line.get("text"))
        header = extract_header_fields(page_text)

        columns = infer_columns_from_lines(lines)
        header_line = detect_header_row(lines, {})
        items: list[dict] = []
        if header_line and columns:
            field_columns = map_header_words_to_columns(header_line, columns)
            raw_rows = extract_item_rows_from_layout(lines, header_line, field_columns)
            items = cleanup_extracted_rows(raw_rows)

        if not items and page_text:
            try:
                fallback_items = extract_items_from_raw_text(page_text)
                items = cleanup_extracted_rows(fallback_items)
            except Exception:
                items = []

        po_number = str(header.get("po_number") or "").strip()
        if not po_number:
            continue

        page_docs.append(
            {
                "page_no": page_no,
                "po_number": po_number,
                "header": header,
                "items": items,
                "raw_text": page_text or "",
            }
        )

    if len(page_docs) <= 1:
        return []

    grouped: dict[str, list[dict[str, object]]] = defaultdict(list)
    for doc in page_docs:
        grouped[str(doc["po_number"])].append(doc)

    if len(grouped) <= 1:
        return []

    split_seed = f"{getattr(file, 'name', 'pdf')}|{len(grouped)}|{len(page_docs)}"
    split_key = f"PDF-{hashlib.sha1(split_seed.encode('utf-8', errors='ignore')).hexdigest()[:12]}"

    documents: list[tuple[dict, pd.DataFrame, str]] = []
    for idx, (po_number, docs) in enumerate(grouped.items(), start=1):
        docs_sorted = sorted(docs, key=lambda d: int(d.get("page_no") or 0))
        combined_header = dict(docs_sorted[0].get("header") or {})
        combined_header["po_number"] = po_number
        combined_header["document_number"] = po_number
        combined_header["document_type"] = combined_header.get("document_type") or "PO"
        combined_header = _apply_document_family_metadata(
            combined_header,
            raw_text="\n".join(str(d.get("raw_text") or "") for d in docs_sorted),
            filename=filename,
            detected_format="PDF",
        )
        combined_header["raw_text"] = "\n".join(str(d.get("raw_text") or "") for d in docs_sorted)
        combined_header["_split_key"] = split_key
        combined_header["_split_sequence"] = idx
        combined_header["_source_locator"] = {
            "pages": [int(d.get("page_no") or 0) for d in docs_sorted],
            "po_number": po_number,
        }

        combined_items: list[dict] = []
        for d in docs_sorted:
            combined_items.extend(d.get("items") or [])

        documents.append((combined_header, pd.DataFrame(combined_items), "pdf"))

    return documents


def parse_file_smart(file):
    """
    Universal parser entry point used by worker.

    Returns:
    - header dict
    - items dataframe
    - vendor
    """

    filename = _decode_mime_filename(getattr(file, "name", "unknown"))
    lower_filename = filename.lower()

    if lower_filename.endswith(".pdf"):
        result = parse_pdf_ai_structured(file)
        header = result.get("header", {}) or {}
        header.setdefault("raw_text", result.get("raw_text") or header.get("raw_text") or "")
        header = _apply_document_family_metadata(
            header,
            raw_text=header.get("raw_text") or "",
            filename=filename,
            detected_format="PDF",
        )
        items = result.get("items", [])
        df = pd.DataFrame(items)
        vendor = header.get("vendor") or header.get("supplier") or header.get("supplier_name") or "default"
        return header, df, vendor

    if lower_filename.endswith((".xlsx", ".xls")):
        file.seek(0)
        raw_df = pd.read_excel(file)
        normalized_df = _normalize_tabular_dataframe(raw_df)
        inferred = _infer_tabular_header_metadata(raw_df)
        header = {
            "po_number": inferred.get("document_number"),
            "document_number": inferred.get("document_number"),
            "po_date": inferred.get("document_date"),
            "document_date": inferred.get("document_date"),
            "vendor": "excel",
            "document_type": "PO",
            "raw_text": _dataframe_to_text(raw_df),
        }
        header = _apply_document_family_metadata(
            header,
            raw_text=header.get("raw_text") or "",
            filename=filename,
            detected_format="EXCEL",
        )
        return header, normalized_df, "excel"

    if lower_filename.endswith(".csv"):
        file.seek(0)
        try:
            raw_df = pd.read_csv(file, sep=None, engine="python")
        except Exception:
            file.seek(0)
            raw_df = pd.read_csv(file)
        normalized_df = _normalize_tabular_dataframe(raw_df)
        inferred = _infer_tabular_header_metadata(raw_df)
        header = {
            "po_number": inferred.get("document_number"),
            "document_number": inferred.get("document_number"),
            "po_date": inferred.get("document_date"),
            "document_date": inferred.get("document_date"),
            "vendor": "csv",
            "document_type": "PO",
            "raw_text": _dataframe_to_text(raw_df),
        }
        header = _apply_document_family_metadata(
            header,
            raw_text=header.get("raw_text") or "",
            filename=filename,
            detected_format="CSV",
        )
        return header, normalized_df, "csv"

    raw_text = _read_text_payload(file)
    detected_format = _detect_text_format(filename, raw_text)

    if detected_format in {"X12", "EDIFACT", "XML"}:
        parser = get_source_parser(detected_format)
        parsed = parser.parse({"raw_text": raw_text})
        header = parsed.get("header") or {}
        items = parsed.get("items") or []
        header["raw_text"] = raw_text
        header = _apply_document_family_metadata(
            header,
            raw_text=raw_text,
            filename=filename,
            detected_format=detected_format,
        )
        if header.get("document_type") == "INVOICE" and not header.get("reference_po_number") and header.get("po_number"):
            header["reference_po_number"] = header.get("po_number")
        vendor = header.get("vendor") or header.get("supplier") or header.get("supplier_name") or detected_format.lower()
        return header, pd.DataFrame(items), vendor

    if detected_format == "JSON":
        try:
            payload = json.loads(raw_text)
        except Exception:
            payload = {}
        parser = get_source_parser("JSON")
        parsed = parser.parse(payload if isinstance(payload, dict) else {"items": payload, "raw_text": raw_text})
        header = parsed.get("header") or {}
        items = parsed.get("items") or []
        header["raw_text"] = raw_text
        header = _apply_document_family_metadata(
            header,
            raw_text=raw_text,
            filename=filename,
            detected_format=detected_format,
        )
        if header.get("document_type") == "INVOICE" and not header.get("reference_po_number") and header.get("po_number"):
            header["reference_po_number"] = header.get("po_number")
        vendor = header.get("vendor") or header.get("supplier") or header.get("supplier_name") or "json"
        return header, pd.DataFrame(items), vendor

    df = pd.DataFrame([{"raw_text": raw_text}])
    header = {
        "po_number": "TEXT_UPLOAD",
        "vendor": "text",
        "document_type": "INVOICE" if _looks_like_invoice({}, raw_text) else "PO",
        "raw_text": raw_text,
    }
    header = _apply_document_family_metadata(
        header,
        raw_text=raw_text,
        filename=filename,
        detected_format=detected_format,
    )
    return header, df, "text"
# =============================================================================
# Multi-PO entry point — Phase 2
# =============================================================================
#
# parse_file_smart_multi is a thin wrapper around parse_file_smart that supports
# files containing multiple POs.
#
# Returns: list[tuple[dict, pd.DataFrame, str]]
#   Each tuple is the same (header, items_df, vendor) shape that parse_file_smart
#   has always returned. A single-PO file produces a 1-element list. A multi-PO
#   X12 / EDIFACT file produces N elements, one per logical PO.
#
# Existing callers of parse_file_smart are unchanged. New callers (job_handlers
# multi-PO loop) call this function and iterate over the result.
# =============================================================================

def parse_file_smart_multi(file):
    """
    Multi-PO aware version of parse_file_smart.

    For X12 (multi-ST) and EDIFACT (multi-UNH) source files, calls the
    document_splitter_service first. If multiple logical documents are detected,
    parses each chunk independently and returns a list of N (header, df, vendor)
    tuples. Otherwise behaves identically to parse_file_smart, wrapping its
    single result in a one-element list.
    """
    from backend.services.document_splitter_service import split_documents

    filename = _decode_mime_filename(getattr(file, "name", "unknown"))
    lower_filename = filename.lower()

    if lower_filename.endswith(".pdf"):
        multi_docs = _parse_pdf_multi_documents(file)
        if multi_docs:
            return multi_docs
        file.seek(0)
        return [parse_file_smart(file)]

    if lower_filename.endswith((".xlsx", ".xls")):
        multi_docs = _parse_two_sheet_workbook_documents(file)
        if multi_docs:
            return multi_docs
        file.seek(0)
        return [parse_file_smart(file)]

    # Multi-PO splitting only applies to text-based EDI formats today.
    # PDF / Excel / CSV / JSON go straight through as single docs (Phase 2b).
    text_based_extensions = (".txt", ".x12", ".edi", ".edifact", ".dat")
    is_text_based = lower_filename.endswith(text_based_extensions) or "." not in lower_filename

    # For non-text formats, just call the existing parser once.
    if not is_text_based:
        return [parse_file_smart(file)]

    # Read raw text once so we can both detect format and pass to splitter.
    raw_text = _read_text_payload(file)
    detected_format = _detect_text_format(filename, raw_text)

    # Splitter only knows X12 and EDIFACT today.
    if detected_format not in {"X12", "EDIFACT"}:
        # Reset file pointer and fall through to single-PO parse.
        file.seek(0)
        return [parse_file_smart(file)]

    # Try splitting. Returns [] when only one logical doc is present.
    split_chunks = split_documents(detected_format, raw_text)

    if not split_chunks or len(split_chunks) <= 1:
        # No split needed — single PO inside an envelope. Reset and parse normally.
        file.seek(0)
        return [parse_file_smart(file)]

    # Multi-PO: parse each chunk's raw_text independently.
    parsed_results: list[tuple] = []
    for chunk in split_chunks:
        chunk_text = chunk.get("raw_text") or ""
        if not chunk_text:
            continue

        parser = get_source_parser(detected_format)
        parsed = parser.parse({"raw_text": chunk_text})
        header = parsed.get("header") or {}
        items = parsed.get("items") or []
        header = _apply_document_family_metadata(
            header,
            raw_text=chunk_text,
            filename=filename,
            detected_format=detected_format,
        )
        header["raw_text"] = chunk_text

        # Stamp split metadata onto the header so downstream code can read it
        # without having to re-derive from the file. The job_handlers loop will
        # also pass split_key / split_sequence as explicit kwargs to
        # process_parsed_po_upload, but having them on the header is harmless
        # and useful for debugging / canonical archives.
        header["_split_sequence"] = chunk.get("split_sequence")
        header["_split_key"] = chunk.get("split_key")
        header["_source_locator"] = chunk.get("source_locator_json")

        vendor = (
            header.get("vendor")
            or header.get("supplier")
            or header.get("supplier_name")
            or detected_format.lower()
        )
        parsed_results.append((header, pd.DataFrame(items), vendor))

    # If, somehow, every chunk failed to produce a usable parse (no raw_text on any),
    # fall back to a single-PO parse rather than returning empty.
    if not parsed_results:
        file.seek(0)
        return [parse_file_smart(file)]

    return parsed_results
