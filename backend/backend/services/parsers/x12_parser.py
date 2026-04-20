from backend.services.parsers.base import SourceParser


class X12Parser(SourceParser):
    parser_name = "x12"

    def parse(self, message, profile=None):
        raw = message.get("raw_text") or ""

        segments = raw.split("~")
        header = {}
        items = []

        current_item = None

        for seg in segments:
            parts = seg.split("*")

            if parts[0] == "BEG":
                header["po_number"] = parts[3]
                header["po_date"] = parts[5]

            elif parts[0] == "N1":
                if parts[1] == "ST":
                    header["ship_to"] = parts[4]
                elif parts[1] == "BT":
                    header["sold_to"] = parts[4]

            elif parts[0] == "PO1":
                current_item = {
                    "line_no": parts[1],
                    "quantity": parts[2],
                    "uom": parts[3],
                    "unit_price": parts[4],
                    "buyer_product_code": parts[7] if len(parts) > 7 else None,
                }
                items.append(current_item)

            elif parts[0] == "PID" and current_item:
                current_item["description"] = parts[-1]

        return {
            "raw_text": raw,
            "header": header,
            "items": items,
            "meta": {
                "parser": self.parser_name,
                "source_format": "X12",
                "message_type": "850",
            },
        }