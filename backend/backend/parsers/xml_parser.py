from backend.core.canonical_models import CanonicalDocument
from backend.parsers.base_parser import BaseParser
class XmlParser(BaseParser):
    parser_name = "xml_parser"
    def can_handle(self, message: dict) -> bool:
        return str(message.get("format_type", "")).upper() == "XML"
    def parse(self, message: dict) -> CanonicalDocument:
        return CanonicalDocument(document_type="PURCHASE_ORDER", message_type="PO", format_type="XML", raw_payload={"xml": message.get("content")}, source_metadata=message.get("metadata", {}) or {})
