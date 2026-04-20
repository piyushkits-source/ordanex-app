from typing import Callable
from backend.core.document_models import CanonicalDocument

class ParserRegistry:
    def __init__(self):
        self.parsers = {}

    def register(self, key: str, parser: Callable):
        self.parsers[key] = parser

    def get_parser(self, key: str):
        return self.parsers.get(key)

parser_registry = ParserRegistry()