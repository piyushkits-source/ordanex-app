from backend.parsers.pdf_parser import PdfParser
from backend.parsers.excel_parser import ExcelParser
from backend.parsers.csv_parser import CsvParser
from backend.parsers.json_parser import JsonParser
from backend.parsers.xml_parser import XmlParser
from backend.parsers.edi_parser import EdiParser
PARSERS = [PdfParser(), ExcelParser(), CsvParser(), JsonParser(), XmlParser(), EdiParser()]
def get_parser(message: dict):
    for parser in PARSERS:
        if parser.can_handle(message):
            return parser
    raise ValueError(f"No parser available for format_type={message.get('format_type')}")
