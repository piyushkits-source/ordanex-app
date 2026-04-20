from backend.core.canonical_models import CanonicalDocument, LineItem
from backend.parsers.base_parser import BaseParser
class JsonParser(BaseParser):
    parser_name = "json_parser"
    def can_handle(self, message: dict) -> bool:
        return str(message.get("format_type", "")).upper() == "JSON"
    def parse(self, message: dict) -> CanonicalDocument:
        payload = message.get("payload") or {}
        doc = CanonicalDocument(document_type=payload.get("document_type") or "PURCHASE_ORDER", message_type=payload.get("message_type") or "PO", format_type="JSON", document_number=payload.get("document_number") or payload.get("po_number"), document_date=payload.get("document_date") or payload.get("po_date"), currency_code=payload.get("currency_code") or payload.get("currency"), header_fields=payload.get("header_fields") or {}, references=payload.get("references") or {}, totals=payload.get("totals") or {}, raw_payload=payload, source_metadata=message.get("metadata", {}) or {})
        doc.line_items = [LineItem(line_no=item.get("line_no") or idx, material_code=item.get("material_code"), description=item.get("description"), quantity=item.get("quantity"), uom=item.get("uom"), unit_price=item.get("unit_price"), amount=item.get("amount"), delivery_date=item.get("delivery_date"), extra=item) for idx,item in enumerate(payload.get("items") or [], start=1)]
        return doc
