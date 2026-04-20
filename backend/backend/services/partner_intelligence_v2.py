from backend.core.canonical_models import CanonicalDocument

def enrich_document_with_partner_intelligence(doc: CanonicalDocument, partner_learning: dict | None = None) -> CanonicalDocument:
    learning = partner_learning or {}
    if not doc.currency_code and learning.get("default_currency"):
        doc.currency_code = learning["default_currency"]
    if not doc.language_code and learning.get("language_code"):
        doc.language_code = learning["language_code"]
    if doc.ship_to and not doc.ship_to.code and learning.get("default_ship_to"):
        doc.ship_to.code = learning["default_ship_to"]
    return doc
