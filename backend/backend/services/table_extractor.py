import pdfplumber
import pandas as pd


def normalize(text):
    if not text:
        return ""
    return str(text).lower().strip()


def detect_column(columns, keywords):
    for col in columns:
        col_norm = normalize(col)
        for key in keywords:
            if key in col_norm:
                return col
    return None


def map_columns(df: pd.DataFrame):
    columns = list(df.columns)

    material_col = detect_column(columns, ["material", "item", "code", "sku"])
    desc_col = detect_column(columns, ["description", "desc", "product"])
    qty_col = detect_column(columns, ["qty", "quantity"])
    price_col = detect_column(columns, ["price", "rate", "amount", "unit price"])

    return {
        "material": material_col,
        "description": desc_col,
        "quantity": qty_col,
        "price": price_col,
    }


def extract_line_items_from_pdf(file_path: str):
    items = []

    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()

            for table in tables:
                if not table or len(table) < 2:
                    continue

                df = pd.DataFrame(table[1:], columns=table[0])

                # Drop empty rows
                df = df.dropna(how="all")

                mapping = map_columns(df)

                for _, row in df.iterrows():
                    item = {
                        "material": row.get(mapping["material"]) if mapping["material"] else None,
                        "description": row.get(mapping["description"]) if mapping["description"] else None,
                        "quantity": row.get(mapping["quantity"]) if mapping["quantity"] else None,
                        "price": row.get(mapping["price"]) if mapping["price"] else None,
                    }

                    # Skip empty rows
                    if any(item.values()):
                        items.append(item)

    return items