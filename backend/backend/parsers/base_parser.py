from backend.core.canonical_models import CanonicalDocument
class BaseParser:
    parser_name = "base"
    def can_handle(self, message: dict) -> bool:
        raise NotImplementedError
    def parse(self, message: dict) -> CanonicalDocument:
        raise NotImplementedError
