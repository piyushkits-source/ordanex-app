from backend.services.parsers.base import SourceParser


class EdifactParser(SourceParser):
    parser_name = "edifact"

    def parse(self, message, profile=None):
        raw = message.get("raw_text") or ""

        segments = raw.split("'")
        header = {}
        items = []

        current_item = None

        for seg in segments:
            parts = seg.split("+")

            if parts[0] == "BGM":
                header["po_number"] = parts[1]

            elif parts[0] == "DTM":
                header["po_date"] = parts[1]

            elif parts[0] == "NAD":
                if parts[1] == "BY":
                    header["sold_to"] = parts[2]
                elif parts[1] == "DP":
                    header["ship_to"] = parts[2]

            elif parts[0] == "LIN":
                current_item = {
                    "line_no": parts[1],
                    "supplier_product_code": parts[3] if len(parts) > 3 else None,
                }
                items.append(current_item)

            elif parts[0] == "PIA" and current_item:
                current_item["buyer_product_code"] = parts[2]

            elif parts[0] == "QTY" and current_item:
                current_item["quantity"] = parts[1]

            elif parts[0] == "PRI" and current_item:
                current_item["unit_price"] = parts[1]

        return {
            "raw_text": raw,
            "header": header,
            "items": items,
            "meta": {
                "parser": self.parser_name,
                "source_format": "EDIFACT",
                "message_type": "ORDERS",
            },
        }