from __future__ import annotations

from typing import Any, Dict

from backend.services.parsers.base import SourceParser
from backend.services.po_parser_hybrid import parse_pdf_ai_structured  # adapt if your function name differs


class PdfParser(SourceParser):
    parser_name = "pdf"

    def parse(self, message: Dict[str, Any], profile: dict | None = None) -> Dict[str, Any]:
        """
        Expects message like:
        {
            "file_path": "...",
            "raw_text": "...",   # optional
        }
        """
        file_path = message.get("file_path")
        raw_text = message.get("raw_text")

        parsed = parse_pdf_ai_structured(file_path=file_path, raw_text=raw_text)

        return {
            "raw_text": parsed.get("raw_text") or raw_text or "",
            "header": parsed.get("header") or {},
            "items": parsed.get("items") or [],
            "meta": {
                "parser": self.parser_name,
                "source_format": "PDF",
            },
        }