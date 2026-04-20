from backend.core.document_models import CanonicalDocument


class PONormalizer:

    def normalize(self, doc: CanonicalDocument) -> dict:
        return {
            "po_number": doc.header.get("po_number"),
            "po_date": doc.header.get("po_date"),
            "items": [
                {
                    "line_no": i.line_no,
                    "material_code": i.material,
                    "description": i.description,
                    "quantity": i.quantity,
                    "unit_price": i.unit_price,
                }
                for i in doc.line_items
            ],
        }


po_normalizer = PONormalizer()