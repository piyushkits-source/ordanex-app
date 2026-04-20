def unify_document_model(raw_text, structured, layout=None):
    return {
        "raw_text": raw_text,
        "structured": structured,
        "layout": layout or []
    }