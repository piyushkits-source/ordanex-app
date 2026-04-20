class XmlParser(SourceParser):
    parser_name = "xml"

    def parse(self, message, profile=None):
        raw = message.get("raw_text") or ""

        root = ET.fromstring(raw)

        header = {
            "po_number": root.findtext(".//poNumber"),
            "po_date": root.findtext(".//poDate"),
            "sold_to": root.findtext(".//soldTo"),
            "ship_to": root.findtext(".//shipTo"),
        }

        items = []
        for idx, item in enumerate(root.findall(".//item"), start=1):
            items.append({
                "line_no": idx,
                "material_code": item.findtext("material"),
                "description": item.findtext("description"),
                "quantity": item.findtext("quantity"),
                "uom": item.findtext("uom"),
                "unit_price": item.findtext("price"),
            })

        return {
            "raw_text": raw,
            "header": header,
            "items": items,
            "meta": {
                "parser": self.parser_name,
                "source_format": "XML",
            },
        }