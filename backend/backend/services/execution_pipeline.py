from __future__ import annotations

from sqlalchemy.orm import Session

from backend.db import models
from backend.services.execution_models import ExecutionContext
from backend.services.address_resolution_service import resolve_address_codes
from backend.services.uom_normalization_service import apply_uom_rules
from backend.services.business_rules_engine import apply_business_rules
from backend.services.mapping_resolution_service import resolve_mapping_profile
from backend.services.payload_mapping_service import apply_mapping_profile
from backend.services.idoc_builder_service import build_orders05_idoc


def execute_order_pipeline(
    db: Session,
    client_id: str,
    partner_id: str,
    source_payload: dict,
    document_type: str = "PO",
    input_format: str = "PDF",
) -> dict:
    ctx = ExecutionContext(
        client_id=client_id,
        partner_id=str(partner_id),
        document_type=document_type,
        input_format=input_format,
        source_payload=source_payload,
        working_payload={
            **source_payload,
            "document_type": document_type,
            "input_format": input_format,
        },
    )

    ctx.info("PIPELINE_START", "Execution pipeline started.")

    partner = (
        db.query(models.TradingPartner)
        .filter(models.TradingPartner.partner_id == partner_id)
        .first()
    )
    if not partner:
        ctx.error("PARTNER_NOT_FOUND", "Trading partner not found.")
        return _finalize(ctx)

    profile = (
        db.query(models.TradingPartnerProfile)
        .filter(models.TradingPartnerProfile.partner_id == partner_id)
        .first()
    )
    if profile:
        ctx.info("PROFILE_FOUND", f"Using profile {profile.profile_name}.")

    derived_codes = resolve_address_codes(db, str(partner_id), ctx.working_payload)
    ctx.derived_codes = derived_codes
    ctx.working_payload.setdefault("header", {}).update(
        {k: v for k, v in derived_codes.items() if k in {"ship_to_code", "sold_to_code", "bill_to_code"}}
    )
    if derived_codes:
        ctx.info("ADDRESS_RESOLVED", "Address resolution completed.")

    ctx.working_payload = apply_uom_rules(db, str(partner_id), ctx.working_payload)
    ctx.info("UOM_APPLIED", "UOM normalization completed.")

    ctx.working_payload, rule_audit = apply_business_rules(db, str(partner_id), ctx.working_payload)
    if rule_audit:
        ctx.info("RULES_APPLIED", f"{len(rule_audit)} business rule(s) applied.")

    if ctx.working_payload.get("rejected"):
        ctx.warn("DOC_REJECTED", ctx.working_payload.get("reject_reason") or "Document rejected.")
        return _finalize(ctx)

    mapping_profile = resolve_mapping_profile(
        db=db,
        partner_id=str(partner_id),
        document_type=document_type,
        input_format=input_format,
    )

    if not mapping_profile:
        ctx.warn("MAPPING_NOT_FOUND", "No mapping profile found. Using working payload directly.")
        ctx.mapped_payload = ctx.working_payload
    else:
        ctx.mapped_payload = apply_mapping_profile(ctx.working_payload, mapping_profile)
        ctx.info("MAPPING_APPLIED", f"Mapping profile {mapping_profile.profile_name} applied.")

    ctx.output_payload = build_orders05_idoc(
        mapped_payload=ctx.mapped_payload,
        partner_context={
            "sender_port": "ORDANEX",
            "sender_type": "LS",
            "sender_partner": "ORDANEX",
            "receiver_port": "SAP",
            "receiver_type": "LS",
            "receiver_partner": "ERP",
        },
    )
    ctx.info("IDOC_BUILT", "ORDERS05 payload generated.")

    return _finalize(ctx)


def _finalize(ctx: ExecutionContext) -> dict:
    return {
        "status": "error" if any(m.level == "ERROR" for m in ctx.messages) else "success",
        "client_id": ctx.client_id,
        "partner_id": ctx.partner_id,
        "document_type": ctx.document_type,
        "input_format": ctx.input_format,
        "derived_codes": ctx.derived_codes,
        "working_payload": ctx.working_payload,
        "mapped_payload": ctx.mapped_payload,
        "output_payload": ctx.output_payload,
        "messages": [
            {"level": m.level, "code": m.code, "text": m.text}
            for m in ctx.messages
        ],
    }