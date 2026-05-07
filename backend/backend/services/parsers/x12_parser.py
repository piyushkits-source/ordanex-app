from backend.services.parsers.base import SourceParser


class X12Parser(SourceParser):
    parser_name = "x12"

    @staticmethod
    def _segments(raw: str) -> list[str]:
        text = (raw or "").strip()
        if not text:
            return []
        if "\n" in text:
            return [line.strip() for line in text.splitlines() if line.strip()]
        sep = "~" if "~" in text else "\n"
        return [seg.strip() for seg in text.split(sep) if seg.strip()]

    @staticmethod
    def _element_sep(text: str) -> str:
        text = (text or "").strip()
        if text.startswith("ISA") and len(text) > 3 and not text[3].isalnum():
            return text[3]
        if "*" in text:
            return "*"
        if "^" in text:
            return "^"
        return "*"

    def parse(self, message, profile=None):
        raw = message.get("raw_text") or ""
        text = raw.strip()
        segments = self._segments(text)
        element_sep = self._element_sep(text)

        header: dict[str, str] = {}
        items: list[dict[str, str]] = []
        current_item = None
        invoice_like = False

        for seg in segments:
            parts = [part.strip() for part in seg.split(element_sep)]
            tag = parts[0] if parts else ""

            if tag == "BIG":
                invoice_like = True
                if len(parts) > 1 and parts[1]:
                    header["invoice_date"] = parts[1]
                if len(parts) > 2 and parts[2]:
                    header["invoice_number"] = parts[2]
                if len(parts) > 4 and parts[4]:
                    header["reference_po_number"] = parts[4]

            elif tag == "CUR" and len(parts) > 2:
                header["currency"] = parts[2]

            elif tag == "TDS" and len(parts) > 1:
                invoice_like = True
                header["invoice_total"] = parts[1]

            elif tag == "N1":
                entity = parts[1] if len(parts) > 1 else ""
                name = parts[2] if len(parts) > 2 else ""
                code = parts[4] if len(parts) > 4 else name
                if entity in {"BT", "BY"}:
                    header["sold_to"] = code or name
                elif entity in {"ST", "SO"}:
                    header["ship_to"] = code or name
                elif entity in {"SF", "SU"}:
                    header["supplier_name"] = code or name

            elif tag == "IT1":
                invoice_like = True
                item_code = None
                if len(parts) > 7 and parts[6] in {"BP", "VP", "IN", "SK"}:
                    item_code = parts[7]
                current_item = {
                    "line_no": parts[1] if len(parts) > 1 and parts[1] else str(len(items) + 1),
                    "quantity": parts[2] if len(parts) > 2 else None,
                    "uom": parts[3] if len(parts) > 3 else None,
                    "unit_price": parts[4] if len(parts) > 4 else None,
                    "buyer_product_code": item_code,
                    "material_code": item_code,
                }
                items.append(current_item)

            elif tag == "PID" and current_item:
                current_item["description"] = parts[-1] if parts else ""

            elif tag == "DTM" and len(parts) > 2:
                qualifier = parts[1]
                value = parts[2]
                if qualifier in {"002", "010", "011"} and value:
                    header.setdefault("invoice_date", value)
                    if current_item is not None:
                        current_item.setdefault("delivery_date", value)

        if invoice_like or header.get("invoice_number") or header.get("invoice_date") or header.get("invoice_total"):
            header["document_type"] = "INVOICE"
            message_type = "INVOICE"
        else:
            message_type = "ORDERS"

        return {
            "raw_text": raw,
            "header": header,
            "items": items,
            "meta": {
                "parser": self.parser_name,
                "source_format": "X12",
                "message_type": message_type,
            },
        }
