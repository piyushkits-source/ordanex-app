from backend.services.parser_registry import parser_registry
from backend.core.document_models import CanonicalDocument


class DocumentIngestionService:

    def ingest(self, file_path: str, file_type: str) -> CanonicalDocument:
        parser = parser_registry.get_parser(file_type)

        if not parser:
            raise Exception(f"No parser found for {file_type}")

        return parser.parse(file_path)


document_ingestion_service = DocumentIngestionService()