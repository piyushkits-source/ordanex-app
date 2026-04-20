from backend.core.canonical_models import CanonicalDocument
from backend.parsers.base_parser import BaseParser
class EdiParser(BaseParser):
    parser_name = "edi_parser"
    def can_handle(self, message: dict) -> bool:
        return str(message.get("format_type", "")).upper() in {"X12", "EDIFACT", "EDI"}
    def parse(self, message: dict) -> CanonicalDocument:
        return CanonicalDocument(document_type="PURCHASE_ORDER", message_type="PO", format_type=str(message.get("format_type", "EDI")).upper(), raw_payload={"edi": message.get("content")}, source_metadata=message.get("metadata", {}) or {})
