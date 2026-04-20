from backend.core.canonical_models import CanonicalDocument, LineItem
from backend.parsers.base_parser import BaseParser

def _to_float(v):
    try:
        if v in [None, ""]: return None
        return float(v)
    except Exception:
        return None
class ExcelParser(BaseParser):
    parser_name = "excel_parser"
    def can_handle(self, message: dict) -> bool:
        return str(message.get("format_type", "")).upper() in {"XLSX", "XLS", "EXCEL"}
    def parse(self, message: dict) -> CanonicalDocument:
        rows = message.get("rows") or []
        header = message.get("header") or {}
        doc = CanonicalDocument(document_type="PURCHASE_ORDER", message_type="PO", format_type="EXCEL", document_number=header.get("document_number") or header.get("po_number"), document_date=header.get("document_date") or header.get("po_date"), currency_code=header.get("currency_code") or header.get("currency"), header_fields=header, raw_payload={"rows": rows, "header": header}, source_metadata=message.get("metadata", {}) or {})
        doc.line_items = [LineItem(line_no=idx, material_code=row.get("material_code") or row.get("item_code"), description=row.get("description"), quantity=_to_float(row.get("quantity")), uom=row.get("uom"), unit_price=_to_float(row.get("unit_price")), amount=_to_float(row.get("amount")), delivery_date=row.get("delivery_date"), extra=row) for idx,row in enumerate(rows, start=1)]
        return doc
