from backend.core.document_models import CanonicalDocument, CanonicalLineItem

# import your existing parser
from backend.services.po_parser_hybrid import parse_file_smart


class PDFParserAdapter:

    def parse(self, file_path: str) -> CanonicalDocument:
        header_df, po_df, vendor = parse_file_smart(file_path)

        header = {}
        if not header_df.empty:
            row = header_df.iloc[0].to_dict()
            header = row

        items = []
        if not po_df.empty:
            for idx, r in po_df.iterrows():
                items.append(
                    CanonicalLineItem(
                        line_no=idx + 1,
                        material=r.get("material"),
                        description=r.get("description"),
                        quantity=r.get("quantity"),
                        unit_price=r.get("price"),
                    )
                )

        return CanonicalDocument(
            doc_type="PO",
            source_type="PDF",
            header=header,
            line_items=items,
        )


pdf_parser = PDFParserAdapter()