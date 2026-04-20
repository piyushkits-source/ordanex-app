from __future__ import annotations

from backend.services.parsers.pdf_parser import PdfParser
from backend.services.parsers.excel_parser import ExcelParser
from backend.services.parsers.json_parser import JsonParser
from backend.services.parsers.x12_parser import X12Parser
from backend.services.parsers.edifact_parser import EdifactParser
from backend.services.parsers.xml_parser import XmlParser


def get_source_parser(source_format: str | None):
    normalized = (source_format or "").strip().upper()

    if normalized in {"PDF", "IMAGE"}:
        return PdfParser()

    if normalized in {"EXCEL", "XLSX", "CSV"}:
        return ExcelParser()

    if normalized in {"JSON", "API"}:
        return JsonParser()

    if normalized in {"X12"}:
        return X12Parser()

    if normalized in {"EDIFACT"}:
        return EdifactParser()

    if normalized in {"XML", "CXML"}:
        return XmlParser()

    return JsonParser()