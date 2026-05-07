import io
import json
import math
import os
import re
from collections import Counter, defaultdict
from statistics import median
from typing import Any, Dict, List, Optional, Tuple

import pdfplumber


# =========================================================
# AUTO-LEARNING LAYOUT ENGINE
# =========================================================
# Purpose:
# - Read PDF word boxes
# - Cluster words into lines
# - Infer columns from x positions
# - Detect likely header row
# - Extract line items table
# - Learn vendor-specific layout hints
# - Reuse learned hints for future files
#
# This is designed to plug into your parser and mapping flow.
# =========================================================

LAYOUT_MEMORY_DIR = "data/layout_learning"


# ---------------------------------------------------------
# FILE / JSON HELPERS
# ---------------------------------------------------------
def _safe_vendor_key(vendor: str) -> str:
    vendor = str(vendor or "default").strip().lower()
    vendor = re.sub(r"[^a-z0-9_\-]+", "_", vendor)
    return vendor or "default"


def _memory_path(vendor: str) -> str:
    os.makedirs(LAYOUT_MEMORY_DIR, exist_ok=True)
    return os.path.join(LAYOUT_MEMORY_DIR, f"{_safe_vendor_key(vendor)}_layout.json")


def load_layout_memory(vendor: str) -> dict:
    path = _memory_path(vendor)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "vendor": vendor,
        "column_x_ranges": {},
        "header_keywords": {},
        "layout_signatures": [],
        "preferred_page_regions": {},
        "last_updated": None,
    }


def save_layout_memory(vendor: str, memory: dict) -> None:
    path = _memory_path(vendor)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(memory, f, indent=2)


# ---------------------------------------------------------
# PDF WORD EXTRACTION
# ---------------------------------------------------------
def extract_pdf_words(file_bytes: bytes) -> Dict[int, List[dict]]:
    pages: Dict[int, List[dict]] = {}
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page_no, page in enumerate(pdf.pages, start=1):
            words = page.extract_words(
                use_text_flow=True,
                keep_blank_chars=False,
                x_tolerance=2,
                y_tolerance=2,
            ) or []

            rows = []
            for idx, w in enumerate(words, start=1):
                rows.append(
                    {
                        "word_id": f"P{page_no}_W{idx}",
                        "page": page_no,
                        "text": str(w.get("text", "")).strip(),
                        "x0": float(w.get("x0", 0)),
                        "x1": float(w.get("x1", 0)),
                        "top": float(w.get("top", 0)),
                        "bottom": float(w.get("bottom", 0)),
                        "width": float(w.get("x1", 0)) - float(w.get("x0", 0)),
                        "height": float(w.get("bottom", 0)) - float(w.get("top", 0)),
                    }
                )
            pages[page_no] = rows
    return pages


# ---------------------------------------------------------
# LINE GROUPING
# ---------------------------------------------------------
def group_words_into_lines(words: List[dict], y_tolerance: float = 4.0) -> List[dict]:
    if not words:
        return []

    words = sorted(words, key=lambda w: (w["top"], w["x0"]))
    lines: List[dict] = []

    for word in words:
        placed = False
        word_y = (word["top"] + word["bottom"]) / 2

        for line in lines:
            if abs(word_y - line["y_center"]) <= y_tolerance:
                line["words"].append(word)
                ys = [(w["top"] + w["bottom"]) / 2 for w in line["words"]]
                line["y_center"] = sum(ys) / len(ys)
                placed = True
                break

        if not placed:
            lines.append(
                {
                    "page": word["page"],
                    "y_center": word_y,
                    "words": [word],
                }
            )

    normalized_lines = []
    for idx, line in enumerate(lines, start=1):
        ws = sorted(line["words"], key=lambda w: w["x0"])
        text = " ".join([w["text"] for w in ws]).strip()
        normalized_lines.append(
            {
                "line_id": f"P{line['page']}_L{idx}",
                "page": line["page"],
                "text": text,
                "words": ws,
                "x0": min(w["x0"] for w in ws),
                "x1": max(w["x1"] for w in ws),
                "top": min(w["top"] for w in ws),
                "bottom": max(w["bottom"] for w in ws),
                "y_center": line["y_center"],
            }
        )

    return normalized_lines


# ---------------------------------------------------------
# COLUMN INFERENCE
# ---------------------------------------------------------
def _bucket_x_positions(x_values: List[float], bucket_size: int = 20) -> Counter:
    buckets = Counter()
    for x in x_values:
        bucket = int(x // bucket_size) * bucket_size
        buckets[bucket] += 1
    return buckets


def infer_columns_from_lines(lines: List[dict]) -> List[dict]:
    x_values = []
    for line in lines:
        if len(line["words"]) >= 2:
            for word in line["words"]:
                x_values.append(word["x0"])

    if not x_values:
        return []

    buckets = _bucket_x_positions(x_values, bucket_size=20)
    common = sorted([x for x, c in buckets.items() if c >= 3])

    merged: List[Tuple[float, float]] = []
    for x in common:
        if not merged:
            merged.append((x, x + 20))
        else:
            last_start, last_end = merged[-1]
            if x <= last_end + 20:
                merged[-1] = (last_start, max(last_end, x + 20))
            else:
                merged.append((x, x + 20))

    columns = []
    for idx, (start, end) in enumerate(merged, start=1):
        columns.append(
            {
                "column_id": f"C{idx}",
                "x_start": round(start, 2),
                "x_end": round(end, 2),
                "x_mid": round((start + end) / 2, 2),
            }
        )
    return columns


# ---------------------------------------------------------
# HEADER DETECTION
# ---------------------------------------------------------
DEFAULT_HEADER_HINTS = {
    "line_no": ["line", "item", "no", "#", "position"],
    "material": ["material", "part", "part-number", "sup. p/n", "item code", "product"],
    "description": ["description", "item description", "designation"],
    "delivery_date": ["delivery", "despatch date", "required date", "date"],
    "quantity": ["qty", "quantity"],
    "uom": ["uom", "unit"],
    "unit_price": ["unit price", "price", "net price"],
    "amount": ["amount", "total", "extended", "value"],
}


def detect_header_row(lines: List[dict], learned_hints: Optional[dict] = None) -> Optional[dict]:
    hints = dict(DEFAULT_HEADER_HINTS)
    for k, vals in (learned_hints or {}).items():
        hints.setdefault(k, [])
        hints[k].extend(vals)

    best_line = None
    best_score = -1

    for line in lines[:30]:
        txt = line["text"].lower()
        score = 0
        for field, keywords in hints.items():
            for kw in keywords:
                if kw.lower() in txt:
                    score += 1
                    break
        if score > best_score:
            best_score = score
            best_line = line

    return best_line if best_score >= 2 else None


# ---------------------------------------------------------
# COLUMN LABEL TO RANGE
# ---------------------------------------------------------
def map_header_words_to_columns(header_line: dict, columns: List[dict]) -> Dict[str, dict]:
    header_words = header_line["words"]
    mapping: Dict[str, dict] = {}

    def word_column(word):
        x = word["x0"]
        for col in columns:
            if col["x_start"] - 10 <= x <= col["x_end"] + 10:
                return col
        return None

    combined_text = header_line["text"].lower()

    for field, keywords in DEFAULT_HEADER_HINTS.items():
        for kw in keywords:
            if kw.lower() in combined_text:
                matched_words = [w for w in header_words if kw.split()[0].lower() in w["text"].lower()]
                if matched_words:
                    col = word_column(matched_words[0])
                    if col:
                        mapping[field] = col
                        break
        if field not in mapping:
            # fallback by approximate keyword hit on individual word
            for word in header_words:
                low = word["text"].lower()
                if any(k.lower() in low for k in keywords):
                    col = word_column(word)
                    if col:
                        mapping[field] = col
                        break

    return mapping


# ---------------------------------------------------------
# ROW EXTRACTION
# ---------------------------------------------------------
def _word_to_field(word: dict, field_columns: Dict[str, dict]) -> Optional[str]:
    x = word["x0"]
    best_field = None
    best_distance = math.inf

    for field, col in field_columns.items():
        if col["x_start"] - 12 <= x <= col["x_end"] + 40:
            distance = abs(x - col["x_mid"])
            if distance < best_distance:
                best_distance = distance
                best_field = field

    return best_field


def extract_item_rows_from_layout(
    lines: List[dict],
    header_line: dict,
    field_columns: Dict[str, dict],
    stop_keywords: Optional[List[str]] = None,
) -> List[dict]:
    stop_keywords = stop_keywords or [
        "payment terms", "subtotal", "total", "tax", "vat", "thank you", "delivery address"
    ]

    rows = []
    start_collecting = False
    current_row = None

    for line in lines:
        if line["line_id"] == header_line["line_id"]:
            start_collecting = True
            continue

        if not start_collecting:
            continue

        line_text_lower = line["text"].lower()
        if any(k in line_text_lower for k in stop_keywords):
            break

        if not line["words"]:
            continue

        row_candidate = {
            "line_no": "",
            "material": "",
            "description": "",
            "delivery_date": "",
            "quantity": "",
            "uom": "",
            "unit_price": "",
            "amount": "",
            "_source_text": line["text"],
            "_line_id": line["line_id"],
        }

        assigned_any = False
        for word in line["words"]:
            field = _word_to_field(word, field_columns)
            if not field:
                continue

            existing = row_candidate.get(field, "")
            row_candidate[field] = f"{existing} {word['text']}".strip()
            assigned_any = True

        if not assigned_any:
            continue

        # detect continuation line
        has_anchor = bool(row_candidate["material"] or row_candidate["quantity"] or row_candidate["amount"])
        if has_anchor:
            if current_row:
                rows.append(current_row)
            current_row = row_candidate
        else:
            if current_row:
                current_row["description"] = f"{current_row.get('description', '')} {row_candidate.get('description', '')}".strip()

    if current_row:
        rows.append(current_row)

    return rows


# ---------------------------------------------------------
# CLEANING
# ---------------------------------------------------------
def normalize_material(mat: str) -> str:
    mat = str(mat or "").strip().upper()
    mat = re.sub(r"[^A-Z0-9\-/]", "", mat)
    return mat


def normalize_description(desc: str) -> str:
    desc = str(desc or "").strip()
    desc = re.sub(r"\s+", " ", desc)
    return desc


def _to_float(value: Any) -> float:
    s = str(value or "").strip().replace(" ", "")
    if s.count(",") == 1 and s.count(".") == 0:
        s = s.replace(",", ".")
    elif s.count(",") >= 1 and s.count(".") >= 1:
        s = s.replace(",", "")
    m = re.search(r"[-+]?\d*\.?\d+", s)
    return float(m.group(0)) if m else 0.0


def cleanup_extracted_rows(rows: List[dict]) -> List[dict]:
    cleaned = []
    for idx, row in enumerate(rows, start=1):
        line_no = row.get("line_no") or str(idx)
        material = normalize_material(row.get("material"))
        desc = normalize_description(row.get("description"))
        qty = _to_float(row.get("quantity"))
        uom = str(row.get("uom") or "").strip().upper()
        unit_price = _to_float(row.get("unit_price"))
        amount = _to_float(row.get("amount"))
        delivery_date = str(row.get("delivery_date") or "").strip()

        if amount <= 0 and qty > 0 and unit_price > 0:
            amount = round(qty * unit_price, 2)
        if unit_price <= 0 and qty > 0 and amount > 0:
            unit_price = round(amount / qty, 4)

        # reject obviously empty rows
        if not material and not desc:
            continue
        if qty <= 0 and unit_price <= 0 and amount <= 0:
            continue

        cleaned.append(
            {
                "line_no": line_no,
                "material": material,
                "description": desc,
                "delivery_date": delivery_date,
                "quantity": qty if qty > 0 else None,
                "uom": uom or None,
                "unit_price": unit_price,
                "amount": amount,
                "_source_text": row.get("_source_text", ""),
                "_line_id": row.get("_line_id", ""),
            }
        )

    return cleaned


# ---------------------------------------------------------
# LEARNING ENGINE
# ---------------------------------------------------------
def learn_layout_from_result(vendor: str, layout_result: dict) -> dict:
    memory = load_layout_memory(vendor)

    field_columns = layout_result.get("field_columns", {}) or {}
    header_line = layout_result.get("header_line") or {}
    signature = layout_result.get("layout_signature")
    page = layout_result.get("page")

    # learn column ranges
    for field, col in field_columns.items():
        memory["column_x_ranges"][field] = {
            "x_start": col.get("x_start"),
            "x_end": col.get("x_end"),
            "x_mid": col.get("x_mid"),
        }

    # learn header keywords from detected header row
    if header_line:
        text = str(header_line.get("text", "")).lower()
        words = [w.strip(" :;/").lower() for w in text.split() if w.strip()]
        for field in DEFAULT_HEADER_HINTS.keys():
            memory["header_hints"].setdefault(field, [])
            for word in words:
                if word and len(word) > 2 and word not in memory["header_hints"][field]:
                    # only lightly enrich; this is intentionally conservative
                    if any(base in word for base in ["qty", "date", "item", "part", "desc", "price", "amount", "unit"]):
                        memory["header_hints"][field].append(word)

    if signature and signature not in memory["layout_signatures"]:
        memory["layout_signatures"].append(signature)
        memory["layout_signatures"] = memory["layout_signatures"][-20:]

    if page:
        memory["preferred_page_regions"]["table_page"] = page

    memory["last_updated"] = str(pd.Timestamp.utcnow())
    save_layout_memory(vendor, memory)
    return memory


# ---------------------------------------------------------
# MAIN ENGINE
# ---------------------------------------------------------
def auto_learn_layout_engine(file_bytes: bytes, vendor: str = "default") -> dict:
    memory = load_layout_memory(vendor)
    pages = extract_pdf_words(file_bytes)

    best_result = None
    best_score = -1

    for page_no, words in pages.items():
        lines = group_words_into_lines(words)
        columns = infer_columns_from_lines(lines)
        header_line = detect_header_row(lines, memory.get("header_hints", {}))

        if not header_line or not columns:
            continue

        field_columns = map_header_words_to_columns(header_line, columns)
        item_rows = extract_item_rows_from_layout(lines, header_line, field_columns)
        cleaned_rows = cleanup_extracted_rows(item_rows)

        score = len(cleaned_rows) + len(field_columns)
        if score > best_score:
            best_score = score
            best_result = {
                "vendor": vendor,
                "page": page_no,
                "words": words,
                "lines": lines,
                "columns": columns,
                "header_line": header_line,
                "field_columns": field_columns,
                "raw_rows": item_rows,
                "cleaned_rows": cleaned_rows,
                "layout_signature": f"{vendor}_P{page_no}_{len(columns)}_{len(cleaned_rows)}",
            }

    if not best_result:
        return {
            "vendor": vendor,
            "page": None,
            "words": [],
            "lines": [],
            "columns": [],
            "header_line": None,
            "field_columns": {},
            "raw_rows": [],
            "cleaned_rows": [],
            "layout_signature": None,
            "memory": memory,
        }

    learned_memory = learn_layout_from_result(vendor, best_result)
    best_result["memory"] = learned_memory
    return best_result


# ---------------------------------------------------------
# EXPORT FOR MAPPING ENGINE
# ---------------------------------------------------------
def to_mapping_payload(layout_result: dict) -> dict:
    field_columns = layout_result.get("field_columns", {}) or {}
    payload = {
        "layout_signature": layout_result.get("layout_signature"),
        "page": layout_result.get("page"),
        "field_columns": field_columns,
        "sample_rows": layout_result.get("cleaned_rows", [])[:10],
    }
    return payload


# ---------------------------------------------------------
# EXAMPLE USAGE
# ---------------------------------------------------------
if __name__ == "__main__":
    sample_path = "sample_po.pdf"
    if os.path.exists(sample_path):
        with open(sample_path, "rb") as f:
            result = auto_learn_layout_engine(f.read(), vendor="default")
        print(json.dumps(to_mapping_payload(result), indent=2))
    else:
        print("Put a sample_po.pdf file beside this script to test.")
