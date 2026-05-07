from backend.services.parsers.base import SourceParser


class EdifactParser(SourceParser):
    parser_name = "edifact"

    def parse(self, message, profile=None):
        raw = message.get("raw_text") or ""
        segments = [seg.strip() for seg in raw.split("'") if seg.strip()]
        header: dict[str, str] = {}
        items: list[dict[str, str]] = []
        current_item = None
        invoice_like = False

        for seg in segments:
            parts = seg.split("+")
            tag = parts[0] if parts else ""

            if tag == "BGM":
                invoice_like = True
                if len(parts) > 2 and parts[2]:
                    header["invoice_number"] = parts[2].split(":")[0].strip()
                elif len(parts) > 1 and parts[1]:
                    header["invoice_number"] = parts[1].split(":")[0].strip()

            elif tag == "DTM":
                if len(parts) > 1 and ":" in parts[1]:
                    dtm_parts = parts[1].split(":")
                    qualifier = dtm_parts[0]
                    value = dtm_parts[1] if len(dtm_parts) > 1 else ""
                    if qualifier in {"137", "2", "4", "64", "63"} and value:
                        header.setdefault("invoice_date", value)

            elif tag == "MOA" and len(parts) > 1 and ":" in parts[1]:
                moa_parts = parts[1].split(":")
                if moa_parts and moa_parts[0] in {"77", "39", "9"} and len(moa_parts) > 1:
                    invoice_like = True
                    header["invoice_total"] = moa_parts[1]

            elif tag == "NAD":
                code = parts[1] if len(parts) > 1 else ""
                party = parts[2].split(":")[0].strip() if len(parts) > 2 and parts[2] else ""
                if code in {"BY", "CN"}:
                    header["sold_to"] = party
                elif code in {"DP", "ST", "CZ"}:
                    header["ship_to"] = party
                elif code in {"SE", "SU"}:
                    header["supplier_name"] = party

            elif tag == "RFF" and len(parts) > 1 and ":" in parts[1]:
                ref_parts = parts[1].split(":")
                if ref_parts[0] in {"ON", "PO"} and len(ref_parts) > 1:
                    header["reference_po_number"] = ref_parts[1]

            elif tag == "CUX" and len(parts) > 1 and ":" in parts[1]:
                cux_parts = parts[1].split(":")
                if len(cux_parts) > 1 and cux_parts[1]:
                    header["currency"] = cux_parts[1]

            elif tag == "LIN":
                invoice_like = True
                product = parts[3].split(":")[0].strip() if len(parts) > 3 and parts[3] else None
                current_item = {
                    "line_no": parts[1].strip() if len(parts) > 1 and parts[1] else str(len(items) + 1),
                    "supplier_product_code": product,
                    "material_code": product,
                }
                items.append(current_item)

            elif tag == "PIA" and current_item and len(parts) > 2:
                current_item["buyer_product_code"] = parts[2].split(":")[0].strip()

            elif tag == "IMD" and current_item:
                desc = parts[-1].replace(":", " ").strip() if parts else ""
                if desc:
                    current_item["description"] = desc

            elif tag == "QTY" and current_item and len(parts) > 1:
                qty_parts = parts[1].split(":")
                if len(qty_parts) > 1:
                    current_item["quantity"] = qty_parts[1]
                if len(qty_parts) > 2:
                    current_item["uom"] = qty_parts[2]

            elif tag == "PRI" and current_item and len(parts) > 1:
                pri_parts = parts[1].split(":")
                if len(pri_parts) > 1:
                    current_item["unit_price"] = pri_parts[1]

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
                "source_format": "EDIFACT",
                "message_type": message_type,
            },
        }
