from backend.core.parser_factory import get_parser
from backend.core.adapter_factory import get_adapter
from backend.services.partner_intelligence_v2 import enrich_document_with_partner_intelligence
from backend.services.universal_rules_engine import apply_universal_rules

def process_universal_document(message: dict, target_erp: str = "GENERIC", partner_learning: dict | None = None, onboarding_profile: dict | None = None, rules: list[dict] | None = None, uom_rules: list[dict] | None = None):
    parser = get_parser(message)
    canonical_doc = parser.parse(message)
    canonical_doc = enrich_document_with_partner_intelligence(canonical_doc, partner_learning)
    canonical_doc = apply_universal_rules(canonical_doc, onboarding_profile, rules, uom_rules)
    adapter = get_adapter(target_erp)
    outbound_payload = adapter.transform(canonical_doc)
    return {"canonical_document": canonical_doc.model_dump(), "target_payload": outbound_payload, "parser_used": parser.parser_name, "adapter_used": adapter.adapter_name}
