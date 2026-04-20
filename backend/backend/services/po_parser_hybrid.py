import io
import json
import os
import re
from difflib import SequenceMatcher
from typing import Dict, Any, List, Tuple

import pandas as pd
import pdfplumber
import pytesseract
from pdf2image import convert_from_bytes
from openai import OpenAI

# =========================================================
# CONFIG
# =========================================================
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
POPPLER_PATH = r"C:\poppler\poppler-25.12.0\Library\bin"

MODEL = os.getenv("PO_PARSER_MODEL", "gpt-4o-mini")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

MEMORY_PATH = "data/vendor_memory"
LAYOUT_MEMORY_DIR = "data/layout_learning"
DEBUG = True


# =========================================================
# COMMON HELPERS
# =========================================================
def debug_print(*args):
    if DEBUG:
        print(*args)


def clean_text(text: str) -> str:
    text = str(text or "")
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def remove_duplicate_lines(text: str) -> str:
    seen = set()
    out = []
    for line in str(text or "").splitlines():
        normalized = re.sub(r"\s+", " ", line.strip().lower())
        if normalized and normalized not in seen:
            seen.add(normalized)
            out.append(line)
    return "\n".join(out)


def normalize_decimal_string(val: str) -> str:
    s = str(val or "").strip()
    s = s.replace(" ", "")
    if s.count(",") == 1 and s.count(".") == 0:
        s = s.replace(",", ".")
    elif s.count(",") >= 1 and s.count(".") >= 1:
        s = s.replace(",", "")
    return s


def to_float(val):
    if val is None:
        return 0.0
    s = normalize_decimal_string(str(val))
    m = re.search(r"[-+]?\d*\.?\d+", s)
    return float(m.group(0)) if m else 0.0


def normalize_material(mat: str) -> str:
    if not mat:
        return ""
    mat = str(mat).upper().strip()
    mat = re.sub(r"[^A-Z0-9\-/]", "", mat)
    return mat


def normalize_description(desc: str) -> str:
    if not desc:
        return ""
    desc = str(desc).strip().lower()
    desc = desc.replace("ﬁ", "fi").replace("ﬂ", "fl")
    desc = re.sub(r"\s+", " ", desc)
    return desc


# =========================================================
# MEMORY
# =========================================================
def _vendor_memory_file(vendor: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_\-]", "_", str(vendor or "default"))
    return os.path.join(MEMORY_PATH, f"{safe}.json")


def load_memory(vendor: str) -> dict:
    path = _vendor_memory_file(vendor)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "field_hints": {},
        "header_hints": {},
        "vendor_aliases": [],
        "layout_signatures": [],
    }


def save_memory(vendor: str, memory: dict):
    os.makedirs(MEMORY_PATH, exist_ok=True)
    path = _vendor_memory_file(vendor)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(memory, f, indent=2)


def apply_memory(items, memory):
    field_hints = (memory or {}).get("field_hints", {})
    for item in items or []:
        desc = normalize_description(item.get("description", ""))
        if not desc:
            continue
        for field, patterns in field_hints.items():
            if item.get(field):
                continue
            for pattern, value in patterns.items():
                if pattern and pattern in desc:
                    item[field] = value
                    break
    return items


# =========================================================
# TEXT EXTRACTION
# =========================================================
def extract_text_pdf(file_bytes: bytes) -> str:
    text = ""
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                text += (page.extract_text() or "") + "\n"
    except Exception as e:
        debug_print("PDF TEXT ERROR:", e)
    return clean_text(text)


def extract_text_pdf_tables(file_bytes: bytes) -> str:
    chunks = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables() or []
                for table in tables:
                    for row in table or []:
                        row = [str(x).strip() if x is not None else "" for x in row]
                        line = " | ".join([x for x in row if x])
                        if line:
                            chunks.append(line)
    except Exception as e:
        debug_print("PDF TABLE ERROR:", e)
    return clean_text("\n".join(chunks))


def extract_text_ocr(file_bytes: bytes) -> str:
    chunks = []
    try:
        images = convert_from_bytes(file_bytes, dpi=350, poppler_path=POPPLER_PATH)
        for img in images:
            gray = img.convert("L")
            best = ""
            for psm in [4, 6, 11]:
                try:
                    txt = pytesseract.image_to_string(gray, config=f"--oem 3 --psm {psm}")
                    if len(txt or "") > len(best):
                        best = txt
                except Exception:
                    pass
            chunks.append(best)
    except Exception as e:
        debug_print("OCR ERROR:", e)
    return clean_text("\n".join(chunks))


def extract_text_ocr_region(file_bytes: bytes) -> str:
    chunks = []
    try:
        images = convert_from_bytes(file_bytes, dpi=350, poppler_path=POPPLER_PATH)
        for img in images:
            w, h = img.size
            region = img.crop((0, int(h * 0.22), w, int(h * 0.92)))
            region = region.convert("L")
            try:
                chunks.append(pytesseract.image_to_string(region, config="--oem 3 --psm 6"))
            except Exception:
                pass
    except Exception as e:
        debug_print("OCR REGION ERROR:", e)
    return clean_text("\n".join(chunks))


def get_best_text(file_bytes: bytes) -> Tuple[str, dict]:
    pdf_text = extract_text_pdf(file_bytes)
    pdf_table_text = extract_text_pdf_tables(file_bytes)
    ocr_text = extract_text_ocr(file_bytes)
    region_text = extract_text_ocr_region(file_bytes)

    combined = clean_text("\n".join([pdf_text, pdf_table_text, ocr_text, region_text]))
    combined = remove_duplicate_lines(combined)

    candidates = {
        "pdf": pdf_text,
        "pdf_table": pdf_table_text,
        "ocr": ocr_text,
        "region": region_text,
        "combined": combined,
    }
    best_name, best_text = max(candidates.items(), key=lambda kv: len(kv[1] or ""))
    debug_print(f"Using {best_name} text")
    return best_text, candidates


# =========================================================
# HEADER EXTRACTION
# =========================================================
def normalize_po_candidate(value: str) -> str:
    value = str(value or "").strip()
    value = value.replace(" ", "")
    value = value.strip(":#")
    return value


def validate_po_number(po_number: str) -> Dict[str, Any]:
    po = normalize_po_candidate(po_number)
    if not po:
        return {"value": "", "is_valid": False, "confidence": "LOW", "reason": "PO not found"}

    lower_po = po.lower()
    blocked_words = {
        "confirmation", "purchase", "order", "commande", "bon",
        "number", "customer", "supplier", "required", "reference",
        "notes", "product", "description", "qty", "price", "total",
    }

    if lower_po in blocked_words:
        return {"value": po, "is_valid": False, "confidence": "LOW", "reason": "Looks like label"}
    if re.fullmatch(r"[A-Za-z]+", po):
        return {"value": po, "is_valid": False, "confidence": "LOW", "reason": "Plain word"}
    if re.fullmatch(r"\d{1,8}", po):
        return {"value": po, "is_valid": False, "confidence": "LOW", "reason": "Numeric-only looks weak"}
    if re.fullmatch(r"[A-Z]{1,6}-\d{3,20}", po, re.I):
        return {"value": po, "is_valid": True, "confidence": "HIGH", "reason": "Strong PO pattern"}
    if re.fullmatch(r"[A-Z0-9][A-Z0-9\-_\/]{4,30}", po, re.I) and re.search(r"[A-Z]", po, re.I) and re.search(r"\d", po):
        return {"value": po, "is_valid": True, "confidence": "MEDIUM", "reason": "Likely alphanumeric PO"}
    return {"value": po, "is_valid": False, "confidence": "LOW", "reason": "Weak PO pattern"}


def extract_currency(text: str, default_currency: str = "") -> str:
    text_upper = str(text or "").upper()

    labeled_patterns = [
        r"\bCURRENCY\s*[:\-]?\s*(CAD|USD|EUR|INR|GBP|AUD|CHF|JPY|SGD|AED)\b",
        r"\bDEVISE\s*[:\-]?\s*(CAD|USD|EUR|INR|GBP|AUD|CHF|JPY|SGD|AED)\b",
        r"\bCURR(?:ENCY)?\s*[:\-]?\s*(CAD|USD|EUR|INR|GBP|AUD|CHF|JPY|SGD|AED)\b",
    ]
    for pat in labeled_patterns:
        m = re.search(pat, text_upper, re.IGNORECASE)
        if m:
            return m.group(1).upper()

    standalone = re.findall(r"\b(CAD|USD|EUR|INR|GBP|AUD|CHF|JPY|SGD|AED)\b", text_upper)
    if standalone:
        return standalone[0].upper()

    if any(x in text_upper for x in ["TPS", "TVQ", "GST", "QST"]):
        return "CAD"

    return (default_currency or "").upper()


def detect_vendor_name(text: str) -> str:
    lines = [x.strip() for x in str(text or "").splitlines() if x.strip()]
    if not lines:
        return "default"

    for line in lines[:12]:
        ll = line.lower()
        if any(x in ll for x in ["purchase order", "po", "date:", "delivery address", "supplier code"]):
            continue
        if len(line) > 4:
            return re.sub(r"\s+", "_", line[:60]).strip("_")
    return "default"


def build_layout_signature(text: str) -> str:
    top = "\n".join([x.strip() for x in str(text or "").splitlines()[:25]])
    import hashlib
    return hashlib.md5(top.encode("utf-8", errors="ignore")).hexdigest()


def extract_header_fields(text: str, default_currency: str = "") -> dict:
    header = {}
    lines = [l.strip() for l in str(text or "").splitlines() if l.strip()]
    top_text = "\n".join(lines[:25])

    strong = re.findall(r"\b[A-Z]{1,6}-\d{3,20}\b", top_text, re.I)
    if strong:
        info = validate_po_number(strong[0])
        if info["is_valid"]:
            header["po_number"] = info["value"]
            header["po_validation"] = info

    if not header.get("po_number"):
        po_patterns = [
            r"(?:PURCHASE\s*ORDER|PO)\s*(?:\/|NO|NUMBER|#)?\s*[:\-]?\s*([A-Z0-9\-_\/]+)",
            r"(?:BON\s*COMMANDE|BON\s*DE\s*COMMANDE)\s*(?:NO|NUMERO|#)?\s*[:\-]?\s*([A-Z0-9\-_\/]+)",
        ]
        for pat in po_patterns:
            m = re.search(pat, text, re.I)
            if m:
                info = validate_po_number(m.group(1))
                if info["is_valid"]:
                    header["po_number"] = info["value"]
                    header["po_validation"] = info
                    break

    date_match = re.search(r"\b(\d{2}/\d{2}/\d{4})\b", text)
    if date_match:
        header["po_date"] = date_match.group(1)

    header["currency"] = extract_currency(text, default_currency=default_currency)
    header["supplier"] = detect_vendor_name(text)
    header["vendor_layout_signature"] = build_layout_signature(text)
    return header


# =========================================================
# AI
# =========================================================
def extract_json(content: str):
    try:
        return json.loads(content)
    except Exception:
        pass

    m = re.search(r"\{.*\}", str(content or ""), re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass
    return {}


def call_ai_for_po(text: str):
    prompt = f"""
Extract SAP purchase order data.

Return JSON only.

Schema:
{{
  "header": {{
    "po_number": "",
    "supplier": "",
    "po_date": "",
    "currency": ""
  }},
  "items": [
    {{
      "material": "",
      "description": "",
      "quantity": "",
      "unit_price": "",
      "amount": "",
      "delivery_date": "",
      "uom": ""
    }}
  ]
}}

Rules:
- Extract only real PO line items.
- Ignore bill-to, ship-to, tax, subtotal, total, address/footer sections.
- Merge multiline descriptions.
- Keep material code exactly as best as possible.
- Prefer fewer accurate rows over many junk rows.

TEXT:
{text[:12000]}
"""
    try:
        r = client.responses.create(model=MODEL, input=prompt)
        return extract_json(r.output[0].content[0].text)
    except Exception as e:
        debug_print("AI HEADER+ITEM ERROR:", e)
        return {}


def call_ai_for_items_only(text: str):
    prompt = f"""
Extract ONLY real purchase order line items.

Return JSON only.

Schema:
{{
  "items": [
    {{
      "material": "",
      "description": "",
      "quantity": "",
      "unit_price": "",
      "amount": "",
      "delivery_date": "",
      "uom": ""
    }}
  ]
}}

Rules:
- Ignore totals, tax, address, phone, contact, payment terms, supplier code.
- Return only purchasable lines.
- Merge multiline descriptions.
- Prefer fewer accurate rows over noisy rows.

TEXT:
{text[:12000]}
"""
    try:
        r = client.responses.create(model=MODEL, input=prompt)
        return extract_json(r.output[0].content[0].text)
    except Exception as e:
        debug_print("AI ITEMS ONLY ERROR:", e)
        return {}


# =========================================================
# RAW FALLBACK
# =========================================================
def extract_items_from_raw_text(text: str) -> List[dict]:
    lines = [l.strip() for l in str(text or "").splitlines() if l.strip()]
    items = []

    for idx, line in enumerate(lines):
        lower_line = line.lower()
        if any(term in lower_line for term in [
            "purchase order", "bill to", "ship to", "delivery address",
            "subtotal", "total", "tax", "address", "phone", "vat code",
            "payment terms", "supplier code", "shipping mode", "contact:", "email:"
        ]):
            continue

        material_match = re.search(r"\b[A-Z0-9\-]{5,}\b", line)
        decimals = re.findall(r"\d+[.,]\d+", line)
        if not material_match or len(decimals) < 2:
            continue

        material = material_match.group(0)
        decimals = [normalize_decimal_string(x) for x in decimals]
        qty = to_float(decimals[0]) if len(decimals) >= 1 else 1.0
        unit_price = to_float(decimals[-2]) if len(decimals) >= 2 else 0.0
        amount = to_float(decimals[-1]) if len(decimals) >= 1 else 0.0

        after_material = line[material_match.end():].strip()
        description = after_material

        desc_parts = [description] if description else []
        j = idx + 1
        while j < len(lines):
            nxt = lines[j].strip()
            nxt_lower = nxt.lower()

            if any(term in nxt_lower for term in [
                "subtotal", "total", "tax", "bill to", "ship to", "telephone",
                "payment terms", "delivery address", "supplier code"
            ]):
                break
            if re.search(r"\b[A-Z0-9\-]{5,}\b", nxt) and re.findall(r"\d+[.,]\d+", nxt):
                break
            if re.search(r"[A-Za-z]", nxt):
                desc_parts.append(nxt)
            j += 1

        description = " ".join([p for p in desc_parts if p]).strip()
        item = {
            "material": material,
            "description": description or material,
            "quantity": qty if qty > 0 else 1.0,
            "unit_price": unit_price,
            "amount": amount,
            "delivery_date": "",
            "uom": "EA",
        }
        debug_print("RAW ITEM FOUND:", item)
        items.append(item)

    return items

def extract_items_table_based(file_bytes: bytes):
    import pdfplumber
    items = []

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()

            for table in tables or []:
                for row in table:
                    if not row:
                        continue

                    row_text = " ".join([str(x) for x in row if x])

                    # detect real line item
                    if re.search(r"\d{4,}", row_text) and re.search(r"\d+\.\d+", row_text):
                        try:
                            material = row[1]
                            description = row[2]
                            qty = row[3]
                            unit = row[4]
                            price = row[5]

                            items.append({
                                "material": str(material),
                                "description": str(description),
                                "quantity": to_float(qty),
                                "unit_price": to_float(price),
                                "uom": str(unit),
                            })
                        except Exception:
                            continue

    return items


# =========================================================
# LAYOUT LEARNING ENGINE
# =========================================================
def _safe_vendor_key(vendor: str) -> str:
    vendor = str(vendor or "default").strip().lower()
    vendor = re.sub(r"[^a-z0-9_\-]+", "_", vendor)
    return vendor or "default"


def _layout_memory_path(vendor: str) -> str:
    os.makedirs(LAYOUT_MEMORY_DIR, exist_ok=True)
    return os.path.join(LAYOUT_MEMORY_DIR, f"{_safe_vendor_key(vendor)}_layout.json")


def load_layout_memory(vendor: str) -> dict:
    path = _layout_memory_path(vendor)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "vendor": vendor,
        "column_x_ranges": {},
        "header_hints": {},
        "layout_signatures": [],
        "preferred_page_regions": {},
        "last_updated": None,
    }


def save_layout_memory(vendor: str, memory: dict) -> None:
    path = _layout_memory_path(vendor)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(memory, f, indent=2)


def extract_pdf_words(file_bytes: bytes) -> Dict[int, List[dict]]:
    pages = {}
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page_no, page in enumerate(pdf.pages, start=1):
            words = page.extract_words(use_text_flow=True, keep_blank_chars=False, x_tolerance=2, y_tolerance=2) or []
            rows = []
            for idx, w in enumerate(words, start=1):
                rows.append({
                    "word_id": f"P{page_no}_W{idx}",
                    "page": page_no,
                    "text": str(w.get("text", "")).strip(),
                    "x0": float(w.get("x0", 0)),
                    "x1": float(w.get("x1", 0)),
                    "top": float(w.get("top", 0)),
                    "bottom": float(w.get("bottom", 0)),
                    "width": float(w.get("x1", 0)) - float(w.get("x0", 0)),
                    "height": float(w.get("bottom", 0)) - float(w.get("top", 0)),
                })
            pages[page_no] = rows
    return pages


def group_words_into_lines(words: List[dict], y_tolerance: float = 4.0) -> List[dict]:
    if not words:
        return []

    words = sorted(words, key=lambda w: (w["top"], w["x0"]))
    lines = []

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
            lines.append({"page": word["page"], "y_center": word_y, "words": [word]})

    out = []
    for idx, line in enumerate(lines, start=1):
        ws = sorted(line["words"], key=lambda w: w["x0"])
        out.append({
            "line_id": f"P{line['page']}_L{idx}",
            "page": line["page"],
            "text": " ".join([w["text"] for w in ws]).strip(),
            "words": ws,
            "x0": min(w["x0"] for w in ws),
            "x1": max(w["x1"] for w in ws),
            "top": min(w["top"] for w in ws),
            "bottom": max(w["bottom"] for w in ws),
            "y_center": line["y_center"],
        })
    return out


def infer_columns_from_lines(lines: List[dict]) -> List[dict]:
    x_values = []
    for line in lines:
        if len(line["words"]) >= 2:
            for word in line["words"]:
                x_values.append(word["x0"])

    if not x_values:
        return []

    buckets = {}
    for x in x_values:
        bucket = int(x // 20) * 20
        buckets[bucket] = buckets.get(bucket, 0) + 1

    common = sorted([x for x, c in buckets.items() if c >= 3])
    merged = []

    for x in common:
        if not merged:
            merged.append((x, x + 20))
        else:
            last_start, last_end = merged[-1]
            if x <= last_end + 20:
                merged[-1] = (last_start, max(last_end, x + 20))
            else:
                merged.append((x, x + 20))

    cols = []
    for idx, (start, end) in enumerate(merged, start=1):
        cols.append({
            "column_id": f"C{idx}",
            "x_start": round(start, 2),
            "x_end": round(end, 2),
            "x_mid": round((start + end) / 2, 2),
        })
    return cols


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


def detect_header_row(lines: List[dict], learned_hints: dict | None = None):
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


def map_header_words_to_columns(header_line: dict, columns: List[dict]) -> Dict[str, dict]:
    header_words = header_line["words"]
    mapping = {}

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
            for word in header_words:
                low = word["text"].lower()
                if any(k.lower() in low for k in keywords):
                    col = word_column(word)
                    if col:
                        mapping[field] = col
                        break
    return mapping


def _word_to_field(word: dict, field_columns: Dict[str, dict]):
    x = word["x0"]
    best_field = None
    best_distance = float("inf")
    for field, col in field_columns.items():
        if col["x_start"] - 12 <= x <= col["x_end"] + 40:
            dist = abs(x - col["x_mid"])
            if dist < best_distance:
                best_distance = dist
                best_field = field
    return best_field


def extract_item_rows_from_layout(lines: List[dict], header_line: dict, field_columns: Dict[str, dict]) -> List[dict]:
    rows = []
    start_collecting = False
    current_row = None
    stop_keywords = ["payment terms", "subtotal", "total", "tax", "vat", "thank you", "delivery address"]

    for line in lines:
        if line["line_id"] == header_line["line_id"]:
            start_collecting = True
            continue
        if not start_collecting:
            continue

        line_text_lower = line["text"].lower()
        if any(k in line_text_lower for k in stop_keywords):
            break

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


def cleanup_extracted_rows(rows: List[dict]) -> List[dict]:
    cleaned = []
    for idx, row in enumerate(rows, start=1):
        line_no = row.get("line_no") or str(idx)
        material = normalize_material(row.get("material"))
        desc = normalize_description(row.get("description"))
        qty = to_float(row.get("quantity"))
        uom = str(row.get("uom") or "").strip().upper()
        unit_price = to_float(row.get("unit_price"))
        amount = to_float(row.get("amount"))
        delivery_date = str(row.get("delivery_date") or "").strip()

        if amount <= 0 and qty > 0 and unit_price > 0:
            amount = round(qty * unit_price, 2)
        if unit_price <= 0 and qty > 0 and amount > 0:
            unit_price = round(amount / qty, 4)

        if not material and not desc:
            continue
        if qty <= 0 and unit_price <= 0 and amount <= 0:
            continue

        cleaned.append({
            "line_no": line_no,
            "material": material,
            "description": desc,
            "delivery_date": delivery_date,
            "quantity": qty if qty > 0 else 1.0,
            "uom": uom or "EA",
            "unit_price": unit_price,
            "amount": amount,
            "_source_text": row.get("_source_text", ""),
            "_line_id": row.get("_line_id", ""),
        })

    return cleaned


def learn_layout_from_result(vendor: str, layout_result: dict) -> dict:
    memory = load_layout_memory(vendor)
    field_columns = layout_result.get("field_columns", {}) or {}
    header_line = layout_result.get("header_line") or {}
    signature = layout_result.get("layout_signature")
    page = layout_result.get("page")

    for field, col in field_columns.items():
        memory["column_x_ranges"][field] = {
            "x_start": col.get("x_start"),
            "x_end": col.get("x_end"),
            "x_mid": col.get("x_mid"),
        }

    if header_line:
        text = str(header_line.get("text", "")).lower()
        words = [w.strip(" :;/").lower() for w in text.split() if w.strip()]
        for field in DEFAULT_HEADER_HINTS.keys():
            memory["header_hints"].setdefault(field, [])
            for word in words:
                if word and len(word) > 2 and word not in memory["header_hints"][field]:
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


# =========================================================
# DEDUP / CLEANUP
# =========================================================
def material_similarity(a: str, b: str) -> float:
    a = normalize_material(a)
    b = normalize_material(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    if a[:10] == b[:10] and len(a) >= 10 and len(b) >= 10:
        return 0.96
    return SequenceMatcher(None, a, b).ratio()


def description_similarity(a: str, b: str) -> float:
    a = normalize_description(a)
    b = normalize_description(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return SequenceMatcher(None, a[:120], b[:120]).ratio()


def is_junk_item(material: str, desc: str, qty: float, price: float, amount: float) -> bool:
    bad_desc = normalize_description(desc)
    blocked_terms = [
        "purchase order", "bill to", "ship to", "subtotal", "sub total",
        "tax", "total", "address", "phone", "telephone", "delivery address",
        "payment terms", "supplier code", "vat code", "contact:", "email:",
        "shipping mode", "net weight", "siret code"
    ]

    if any(term in bad_desc for term in blocked_terms):
        return True
    if qty <= 0 and price <= 0 and amount <= 0:
        return True
    if not material and len(bad_desc) < 3:
        return True
    return False


def choose_better_item(a: dict, b: dict) -> dict:
    score_a = score_b = 0
    score_a += min(len(normalize_material(a.get("material"))), 20)
    score_b += min(len(normalize_material(b.get("material"))), 20)
    score_a += min(len(normalize_description(a.get("description"))), 50)
    score_b += min(len(normalize_description(b.get("description"))), 50)

    for key in ["quantity", "unit_price", "amount"]:
        if to_float(a.get(key)) > 0:
            score_a += 10
        if to_float(b.get(key)) > 0:
            score_b += 10

    if str(a.get("delivery_date", "")).strip():
        score_a += 5
    if str(b.get("delivery_date", "")).strip():
        score_b += 5

    return a if score_a >= score_b else b


def are_duplicate_items(item1: dict, item2: dict) -> bool:
    mat1 = normalize_material(item1.get("material"))
    mat2 = normalize_material(item2.get("material"))
    desc1 = normalize_description(item1.get("description"))
    desc2 = normalize_description(item2.get("description"))

    qty1 = to_float(item1.get("quantity"))
    qty2 = to_float(item2.get("quantity"))
    price1 = to_float(item1.get("unit_price"))
    price2 = to_float(item2.get("unit_price"))
    amt1 = to_float(item1.get("amount"))
    amt2 = to_float(item2.get("amount"))

    mat_sim = material_similarity(mat1, mat2)
    desc_sim = description_similarity(desc1, desc2)

    qty_match = abs(qty1 - qty2) < 0.01 if qty1 > 0 and qty2 > 0 else True
    price_match = abs(price1 - price2) < 0.05 if price1 > 0 and price2 > 0 else True
    amount_match = abs(amt1 - amt2) < 0.05 if amt1 > 0 and amt2 > 0 else True

    if mat_sim >= 0.95 and qty_match and (price_match or amount_match):
        return True
    if mat_sim >= 0.80 and desc_sim >= 0.85 and qty_match and (price_match or amount_match):
        return True
    if (not mat1 or not mat2) and desc_sim >= 0.92 and qty_match and (price_match or amount_match):
        return True
    return False


def cleanup_items(items: list[dict]) -> list[dict]:
    def _norm_text(v):
        return str(v or "").strip().lower()

    def _norm_mat(v):
        return str(v or "").strip().upper()

    def _to_float(v):
        try:
            s = str(v or "").strip().replace(" ", "")
            if s.count(",") == 1 and s.count(".") == 0:
                s = s.replace(",", ".")
            elif s.count(",") >= 1 and s.count(".") >= 1:
                s = s.replace(",", "")
            return float(s)
        except Exception:
            return 0.0

    def _same_text(a, b):
        return _norm_text(a) == _norm_text(b)

    blocked_exact_terms = {
        "net weight",
        "payment terms",
        "total goods",
        "total value",
        "vat",
        "opening hours",
        "unloading on the platform",
        "please acknowledge within 48h",
    }

    continuation_terms = [
        "metal adder",
        "plastic drum",
        "bottle of",
        "piece",
        "net weight",
        "delivery date",
        "=4mu",
        "=1mu",
    ]

    cleaned = []
    pending_prev = None

    for idx, item in enumerate(items or [], start=1):
        material = _norm_mat(item.get("material") or item.get("material_code"))
        desc = str(item.get("description") or "").strip()
        desc_l = _norm_text(desc)
        qty = _to_float(item.get("quantity"))
        price = _to_float(item.get("unit_price"))
        amount = _to_float(item.get("amount"))
        delivery_date = str(item.get("delivery_date") or "").strip()
        uom = str(item.get("uom") or "").strip().upper()

        if not material and desc_l in blocked_exact_terms:
            continue

        if any(term in desc_l for term in ["total goods", "total value", "payment terms", "vat (", "opening hours"]):
            continue

        # continuation row -> merge to previous
        if not material and any(term in desc_l for term in continuation_terms):
            if pending_prev:
                merged_desc = f'{pending_prev.get("description", "")} {desc}'.strip()
                pending_prev["description"] = merged_desc
                if delivery_date and not pending_prev.get("delivery_date"):
                    pending_prev["delivery_date"] = delivery_date
            continue

        # weak row -> merge or skip
        if not material and (qty <= 0 or (price <= 0 and amount <= 0)):
            if pending_prev and desc:
                pending_prev["description"] = f'{pending_prev.get("description", "")} {desc}'.strip()
            continue

        if amount <= 0 and qty > 0 and price > 0:
            amount = round(qty * price, 2)

        if price <= 0 and qty > 0 and amount > 0:
            price = round(amount / qty, 4)

        row = {
            "line_no": item.get("line_no") or idx,
            "material": material or "",
            "material_code": material or "",
            "description": desc,
            "quantity": qty if qty > 0 else 1.0,
            "uom": uom or "EA",
            "unit_price": price,
            "amount": amount,
            "delivery_date": delivery_date,
            "plant": item.get("plant"),
        }

        cleaned.append(row)
        pending_prev = row

    # -------------------------------------------------
    # DEDUPE PASS
    # -------------------------------------------------
    final_rows = []
    seen_keys = set()

    for row in cleaned:
        material = _norm_mat(row.get("material"))
        desc = _norm_text(row.get("description"))
        qty = round(float(row.get("quantity") or 0), 3)
        price = round(float(row.get("unit_price") or 0), 2)
        amount = round(float(row.get("amount") or 0), 2)
        delivery_date = str(row.get("delivery_date") or "").strip()
        uom = str(row.get("uom") or "").strip().upper()

        dedupe_key = (
            material,
            desc,
            qty,
            price,
            amount,
            delivery_date,
            uom,
        )

        # exact duplicate -> skip
        if dedupe_key in seen_keys:
            continue
        seen_keys.add(dedupe_key)

        # near-duplicate with previous -> merge
        if final_rows:
            prev = final_rows[-1]

            same_material = _norm_mat(prev.get("material")) == material and material != ""
            same_desc = _same_text(prev.get("description"), row.get("description"))
            same_qty = round(float(prev.get("quantity") or 0), 3) == qty
            same_price = round(float(prev.get("unit_price") or 0), 2) == price
            same_amount = round(float(prev.get("amount") or 0), 2) == amount

            if (same_material and same_qty and same_price) or (same_desc and same_qty and same_amount):
                if row.get("delivery_date") and not prev.get("delivery_date"):
                    prev["delivery_date"] = row.get("delivery_date")
                if row.get("description") and row.get("description") not in str(prev.get("description") or ""):
                    prev["description"] = f'{prev.get("description", "")} {row.get("description", "")}'.strip()
                continue

        final_rows.append(row)

    # resequence line numbers
    for idx, row in enumerate(final_rows, start=1):
        row["line_no"] = idx

    return final_rows


# =========================================================
# MAIN HYBRID PARSER
# =========================================================
def merge_layout_header(header: dict, layout_result: dict) -> dict:
    header = dict(header or {})
    rows = layout_result.get("cleaned_rows", []) or []
    if rows:
        header["layout_detected"] = True
    header["layout_signature"] = layout_result.get("layout_signature")
    header["layout_page"] = layout_result.get("page")
    return header


def parse_pdf_ai_structured(file, vendor="default", default_currency: str = ""):
    file_bytes = file.read()
    text, text_sources = get_best_text(file_bytes)

    debug_print("TEXT SAMPLE:", text[:1500])

    ai_data = call_ai_for_po(text)
    ai_header = ai_data.get("header", {}) if isinstance(ai_data, dict) else {}
    ai_items = ai_data.get("items", []) if isinstance(ai_data, dict) else []

    rule_header = extract_header_fields(text, default_currency=default_currency)
    header = dict(ai_header) if isinstance(ai_header, dict) else {}

    ai_po_info = validate_po_number(ai_header.get("po_number", ""))
    rule_po_info = validate_po_number(rule_header.get("po_number", ""))

    if rule_po_info.get("is_valid") and not ai_po_info.get("is_valid"):
        header["po_number"] = rule_po_info["value"]
    elif rule_po_info.get("is_valid") and ai_po_info.get("is_valid"):
        if rule_po_info.get("confidence") == "HIGH" and ai_po_info.get("confidence") != "HIGH":
            header["po_number"] = rule_po_info["value"]
    elif not header.get("po_number") and rule_header.get("po_number"):
        header["po_number"] = rule_header.get("po_number")

    for k, v in rule_header.items():
        if v and not header.get(k):
            header[k] = v

    detected_vendor = header.get("supplier") or vendor or detect_vendor_name(text)

    # 1) Layout-first extraction
    layout_result = auto_learn_layout_engine(file_bytes, detected_vendor)
    layout_items = layout_result.get("cleaned_rows", []) or []
    header = merge_layout_header(header, layout_result)

    # 2) AI extraction
    debug_print("AI ITEMS:", len(ai_items))
    if not ai_items:
        retry = call_ai_for_items_only(text)
        ai_items = retry.get("items", []) if isinstance(retry, dict) else []
    debug_print("AFTER AI RETRY:", len(ai_items))
    cleaned_ai = cleanup_items(ai_items)
    debug_print("CLEANED AI ITEMS:", len(cleaned_ai))

    # 3) Choose best source
    final_items = []
    source_used = "LAYOUT"

    if layout_items:
        final_items = cleanup_items(layout_items)
        source_used = "LAYOUT"
    elif cleaned_ai:
        final_items = cleaned_ai
        source_used = "AI"
    else:
        raw_items = extract_items_from_raw_text(text)
        final_items = cleanup_items(raw_items)
        source_used = "RAW"

    # 4) If layout too weak, prefer AI
    if len(final_items) <= 1 and len(cleaned_ai) > len(final_items):
        final_items = cleaned_ai
        source_used = "AI"

    # 5) Vendor memory
    memory = load_memory(detected_vendor)
    final_items = apply_memory(final_items, memory)

    po_info = validate_po_number(header.get("po_number", ""))
    header["po_validation"] = po_info
    if po_info["is_valid"]:
        header["po_number"] = po_info["value"]

    if not header.get("currency"):
        header["currency"] = (default_currency or "").upper()

    header["vendor"] = detected_vendor
    header["source_used"] = source_used
    header["text_source_lengths"] = {k: len(v or "") for k, v in text_sources.items()}

    result = {
        "header": header,
        "items": final_items,
        "raw_text": text,
        "parser_meta": {
            "vendor": detected_vendor,
            "layout_signature": layout_result.get("layout_signature"),
            "layout_page": layout_result.get("page"),
            "layout_item_count": len(layout_items),
            "ai_item_count": len(ai_items),
            "final_item_count": len(final_items),
            "source_used": source_used,
            "field_columns": layout_result.get("field_columns", {}),
            "text_source_lengths": {k: len(v or "") for k, v in text_sources.items()},
        },
    }

    debug_print("FINAL ITEMS:", len(final_items))
    debug_print("FINAL PO:", header.get("po_number"))
    debug_print("FINAL CURRENCY:", header.get("currency"))
    debug_print("PO VALIDATION:", header.get("po_validation"))
    debug_print("RETURN RAW_TEXT LENGTH:", len(text or ""))
    debug_print("SOURCE USED:", source_used)

    return result


def ai_to_dataframe(ai_json):
    return pd.DataFrame(ai_json.get("items", []))
