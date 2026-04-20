import re
from backend.core.canonical_models import CanonicalDocument, Party
from backend.parsers.base_parser import BaseParser
class PdfParser(BaseParser):
    parser_name = "pdf_parser"
    def can_handle(self, message: dict) -> bool:
        return str(message.get("format_type", "")).upper() == "PDF"
    def parse(self, message: dict) -> CanonicalDocument:
        text = str(message.get("text") or message.get("content") or "")
        document_number = None
        document_date = None
        po_match = re.search(r"(PO|Order|订单号码|Purchase Order)\s*[:#]?\s*([A-Za-z0-9\-/]+)", text, re.IGNORECASE)
        if po_match: document_number = po_match.group(2)
        date_match = re.search(r"(\d{4}-\d{2}-\d{2}|\d{2}[/-][A-Za-z]{3}[/-]\d{4}|\d{2}[/-]\d{2}[/-]\d{4})", text)
        if date_match: document_date = date_match.group(1)
        return CanonicalDocument(document_type="PURCHASE_ORDER", message_type="PO", format_type="PDF", document_number=document_number, document_date=document_date, raw_payload={"text": text}, source_metadata=message.get("metadata", {}) or {}, buyer=Party(name=message.get("buyer_name")), supplier=Party(name=message.get("supplier_name")))
