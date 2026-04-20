from __future__ import annotations

from sqlalchemy.orm import Session

from backend.db import models
from backend.services.execution_models import ExecutionContext
from backend.services.address_resolution_service import resolve_address_codes
from backend.services.uom_normalization_service import apply_uom_rules
from backend.services.business_rules_engine import apply_business_rules
from backend.services.mapping_resolution_service import resolve_mapping_profile
from backend.services.payload_mapping_service import apply_mapping_profile
from backend.services.flow_resolution_service import resolve_message_flow, FlowResolutionError
from backend.services.builder_registry import resolve_output_builder, BuilderRegistryError


def execute_order_pipeline_v2(
    db: Session,
    *,
    client_id: str,
    vertical_id: str | None,
    partner_id: str,
    source_payload: dict,
    document_type: str,
    message_direction: str,
    source_format: str,
    source_message_standard: str | None = None,
    source_message_type: str | None = None,
    source_message_version: str | None = None,
) -> dict:
    ctx = ExecutionContext(
        client_id=client_id,
        partner_id=str(partner_id),
        document_type=document_type,
        input_format=source_format,
        source_payload=source_payload,
        working_payload={
            **source_payload,
            "document_type": document_type,
            "input_format": source_format,
        },
    )

    ctx.info("PIPELINE_START", "Execution pipeline v2 started.")

    partner = (
        db.query(models.TradingPartner)
        .filter(models.TradingPartner.partner_id == partner_id)
        .first()
    )
    if not partner:
        ctx.error("PARTNER_NOT_FOUND", "Trading partner not found.")
        return _finalize(ctx)

    try:
        flow = resolve_message_flow(
            db=db,
            client_id=client_id,
            vertical_id=vertical_id,
            partner_id=partner_id,
            document_type=document_type,
            message_direction=message_direction,
            source_format=source_format,
            source_message_standard=source_message_standard,
            source_message_type=source_message_type,
            source_message_version=source_message_version,
        )
    except FlowResolutionError as exc:
        ctx.error("FLOW_NOT_FOUND", str(exc))
        return _finalize(ctx)

    ctx.info("FLOW_RESOLVED", f"Using flow {flow.flow_name}.")

    derived_codes = resolve_address_codes(db, str(partner_id), ctx.working_payload)
    ctx.derived_codes = derived_codes
    ctx.working_payload.setdefault("header", {}).update(
        {k: v for k, v in derived_codes.items() if k in {"ship_to_code", "sold_to_code", "bill_to_code"}}
    )

    ctx.working_payload = apply_uom_rules(db, str(partner_id), ctx.working_payload)
    ctx.info("UOM_APPLIED", "UOM normalization completed.")

    ctx.working_payload, rule_audit = apply_business_rules(db, str(partner_id), ctx.working_payload)
    if rule_audit:
        ctx.info("RULES_APPLIED", f"{len(rule_audit)} rule(s) applied.")

    if ctx.working_payload.get("rejected"):
        ctx.warn("DOC_REJECTED", ctx.working_payload.get("reject_reason") or "Document rejected.")
        return _finalize(ctx)

    mapping_profile = None
    if flow.mapping_profile_id:
        mapping_profile = (
            db.query(models.TradingPartnerMappingProfile)
            .filter(models.TradingPartnerMappingProfile.profile_id == flow.mapping_profile_id)
            .first()
        )
    else:
        mapping_profile = resolve_mapping_profile(
            db=db,
            partner_id=str(partner_id),
            document_type=document_type,
            input_format=source_format,
        )

    if mapping_profile:
        ctx.mapped_payload = apply_mapping_profile(ctx.working_payload, mapping_profile)
        ctx.info("MAPPING_APPLIED", f"Mapping profile applied: {getattr(mapping_profile, 'profile_name', 'n/a')}")
    else:
        ctx.warn("MAPPING_NOT_FOUND", "No mapping profile found. Using working payload.")
        ctx.mapped_payload = ctx.working_payload

    try:
        builder = resolve_output_builder(
            target_erp=flow.target_erp,
            target_message_standard=flow.target_message_standard,
            target_message_type=flow.target_message_type,
            target_message_version=flow.target_message_version,
        )
    except BuilderRegistryError as exc:
        ctx.error("BUILDER_NOT_FOUND", str(exc))
        return _finalize(ctx)

    ctx.output_payload = builder(
        ctx.mapped_payload,
        {
            "target_erp": flow.target_erp,
            "target_message_standard": flow.target_message_standard,
            "target_message_type": flow.target_message_type,
            "target_message_version": flow.target_message_version,
            "target_connection_id": str(flow.target_connection_id) if flow.target_connection_id else None,
        },
    )
    ctx.info("OUTPUT_BUILT", "Output payload built successfully.")

    return {
        **_finalize(ctx),
        "resolved_flow": {
            "flow_id": str(flow.flow_id),
            "flow_name": flow.flow_name,
            "target_erp": flow.target_erp,
            "target_message_standard": flow.target_message_standard,
            "target_message_type": flow.target_message_type,
            "target_message_version": flow.target_message_version,
            "target_connection_id": str(flow.target_connection_id) if flow.target_connection_id else None,
        },
    }


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
