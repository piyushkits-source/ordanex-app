from backend.core.canonical_models import CanonicalDocument, LineItem
from backend.parsers.base_parser import BaseParser

def _to_float(v):
    try:
        if v in [None, ""]: return None
        return float(v)
    except Exception:
        return None
class CsvParser(BaseParser):
    parser_name = "csv_parser"
    def can_handle(self, message: dict) -> bool:
        return str(message.get("format_type", "")).upper() == "CSV"
    def parse(self, message: dict) -> CanonicalDocument:
        rows = message.get("rows") or []
        doc = CanonicalDocument(document_type="PURCHASE_ORDER", message_type="PO", format_type="CSV", raw_payload={"rows": rows}, source_metadata=message.get("metadata", {}) or {})
        if rows:
            first = rows[0]
            doc.document_number = first.get("document_number") or first.get("po_number")
            doc.document_date = first.get("document_date") or first.get("po_date")
            doc.currency_code = first.get("currency_code") or first.get("currency")
        doc.line_items = [LineItem(line_no=idx, material_code=row.get("material_code") or row.get("item_code"), description=row.get("description"), quantity=_to_float(row.get("quantity")), uom=row.get("uom"), unit_price=_to_float(row.get("unit_price")), amount=_to_float(row.get("amount")), delivery_date=row.get("delivery_date"), extra=row) for idx,row in enumerate(rows, start=1)]
        return doc
