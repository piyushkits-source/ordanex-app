import pdfplumber
import pytesseract
from PIL import Image
import numpy as np
import cv2


# Optional: set path if needed (Windows)
# pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


def clean_text(text: str):
    if not text:
        return None

    text = text.strip()
    text = text.replace("\n", " ")
    text = " ".join(text.split())

    return text if text else None


def extract_text_pdfplumber(page, bbox):
    try:
        cropped = page.within_bbox(bbox)
        text = cropped.extract_text()
        return clean_text(text)
    except Exception:
        return None


def extract_text_ocr(page_image, bbox):
    try:
        x0, y0, x1, y1 = bbox

        crop = page_image[int(y0):int(y1), int(x0):int(x1)]

        if crop.size == 0:
            return None

        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)

        pil_img = Image.fromarray(thresh)

        text = pytesseract.image_to_string(pil_img, config="--psm 6")
        return clean_text(text)

    except Exception:
        return None


def extract_fields_from_pdf(file_path, field_boxes):
    """
    Extract fields using bounding boxes with:
    1. PDF text extraction
    2. OCR fallback if needed
    """

    extracted = {}

    with pdfplumber.open(file_path) as pdf:
        for box in field_boxes:
            try:
                field_name = box.get("field") or box.get("fieldName")
                page_index = int(box.get("page", 1)) - 1

                if not field_name or page_index >= len(pdf.pages):
                    continue

                page = pdf.pages[page_index]

                x0 = float(box["x"])
                y0 = float(box["y"])
                x1 = x0 + float(box["width"])
                y1 = y0 + float(box["height"])

                bbox = (x0, y0, x1, y1)

                # 🔹 Step 1: Try normal PDF text extraction
                text = extract_text_pdfplumber(page, bbox)

                # 🔹 Step 2: OCR fallback if empty
                if not text:
                    page_image = np.array(page.to_image(resolution=300).original)
                    text = extract_text_ocr(page_image, bbox)

                extracted[field_name] = text

            except Exception as e:
                extracted[field_name] = None

    return extracted