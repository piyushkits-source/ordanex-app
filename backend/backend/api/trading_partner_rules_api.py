from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db.models_rules_uom_mapping import (
    TradingPartnerBusinessRule,
    TradingPartnerMappingProfile,
    TradingPartnerOnboardingAudit,
    TradingPartnerUomRule,
)
from backend.db.schemas_rules_uom_mapping import (
    TradingPartnerBusinessRuleCreate,
    TradingPartnerBusinessRuleRead,
    TradingPartnerBusinessRuleUpdate,
    TradingPartnerMappingProfileCreate,
    TradingPartnerMappingProfileRead,
    TradingPartnerMappingProfileUpdate,
    TradingPartnerOnboardingAuditRead,
    TradingPartnerUomRuleCreate,
    TradingPartnerUomRuleRead,
    TradingPartnerUomRuleUpdate,
)
from backend.services.onboarding_config_service import (
    apply_uom_conversion,
    evaluate_business_rules,
    find_mapping_profile,
    write_audit,
)


router = APIRouter(prefix="/trading-partners", tags=["Trading Partner Rules / UOM / Mapping"])


# UOM RULES
@router.get("/{partner_id}/uom-rules", response_model=list[TradingPartnerUomRuleRead])
def list_uom_rules(partner_id: UUID, db: Session = Depends(get_db)):
    return (
        db.query(TradingPartnerUomRule)
        .filter(TradingPartnerUomRule.partner_id == partner_id)
        .order_by(TradingPartnerUomRule.priority.asc(), TradingPartnerUomRule.created_at.asc())
        .all()
    )


@router.post("/{partner_id}/uom-rules", response_model=TradingPartnerUomRuleRead)
def create_uom_rule(partner_id: UUID, payload: TradingPartnerUomRuleCreate, db: Session = Depends(get_db)):
    if payload.partner_id != partner_id:
        raise HTTPException(status_code=400, detail="partner_id mismatch.")

    row = TradingPartnerUomRule(**payload.model_dump())
    db.add(row)
    db.flush()
    write_audit(
        db,
        client_id=payload.client_id,
        partner_id=str(payload.partner_id),
        entity_type="UOM",
        entity_id=str(row.uom_rule_id),
        action="CREATE",
        before_json=None,
        after_json=payload.model_dump(mode="json"),
        actor_email=payload.created_by,
    )
    db.commit()
    db.refresh(row)
    return row


@router.put("/uom-rules/{uom_rule_id}", response_model=TradingPartnerUomRuleRead)
def update_uom_rule(uom_rule_id: UUID, payload: TradingPartnerUomRuleUpdate, db: Session = Depends(get_db)):
    row = db.query(TradingPartnerUomRule).filter(TradingPartnerUomRule.uom_rule_id == uom_rule_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="UOM rule not found.")

    before = {k: v for k, v in row.__dict__.items() if not k.startswith("_")}
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.flush()
    after = {k: v for k, v in row.__dict__.items() if not k.startswith("_")}
    write_audit(
        db,
        client_id=row.client_id,
        partner_id=str(row.partner_id),
        entity_type="UOM",
        entity_id=str(row.uom_rule_id),
        action="UPDATE",
        before_json=before,
        after_json=after,
        actor_email=payload.updated_by,
    )
    db.commit()
    db.refresh(row)
    return row


@router.delete("/uom-rules/{uom_rule_id}")
def delete_uom_rule(uom_rule_id: UUID, db: Session = Depends(get_db)):
    row = db.query(TradingPartnerUomRule).filter(TradingPartnerUomRule.uom_rule_id == uom_rule_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="UOM rule not found.")
    before = {k: v for k, v in row.__dict__.items() if not k.startswith("_")}
    write_audit(
        db,
        client_id=row.client_id,
        partner_id=str(row.partner_id),
        entity_type="UOM",
        entity_id=str(row.uom_rule_id),
        action="DELETE",
        before_json=before,
        after_json=None,
    )
    db.delete(row)
    db.commit()
    return {"status": "success", "message": "UOM rule deleted."}


@router.post("/{partner_id}/uom-rules/evaluate")
def evaluate_uom_rule(partner_id: UUID, payload: dict[str, Any], db: Session = Depends(get_db)):
    return apply_uom_conversion(
        db,
        client_id=payload["client_id"],
        partner_id=partner_id,
        qty=payload["qty"],
        input_uom=payload["input_uom"],
        sold_to=payload.get("sold_to"),
        ship_to=payload.get("ship_to"),
        material_code=payload.get("material_code"),
        product_code=payload.get("product_code"),
    )


# BUSINESS RULES
@router.get("/{partner_id}/business-rules", response_model=list[TradingPartnerBusinessRuleRead])
def list_business_rules(partner_id: UUID, db: Session = Depends(get_db)):
    return (
        db.query(TradingPartnerBusinessRule)
        .filter(TradingPartnerBusinessRule.partner_id == partner_id)
        .order_by(TradingPartnerBusinessRule.priority.asc(), TradingPartnerBusinessRule.created_at.asc())
        .all()
    )


@router.post("/{partner_id}/business-rules", response_model=TradingPartnerBusinessRuleRead)
def create_business_rule(partner_id: UUID, payload: TradingPartnerBusinessRuleCreate, db: Session = Depends(get_db)):
    if payload.partner_id != partner_id:
        raise HTTPException(status_code=400, detail="partner_id mismatch.")

    row = TradingPartnerBusinessRule(**payload.model_dump())
    db.add(row)
    db.flush()
    write_audit(
        db,
        client_id=payload.client_id,
        partner_id=str(payload.partner_id),
        entity_type="RULE",
        entity_id=str(row.rule_id),
        action="CREATE",
        before_json=None,
        after_json=payload.model_dump(mode="json"),
        actor_email=payload.created_by,
    )
    db.commit()
    db.refresh(row)
    return row


@router.put("/business-rules/{rule_id}", response_model=TradingPartnerBusinessRuleRead)
def update_business_rule(rule_id: UUID, payload: TradingPartnerBusinessRuleUpdate, db: Session = Depends(get_db)):
    row = db.query(TradingPartnerBusinessRule).filter(TradingPartnerBusinessRule.rule_id == rule_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Business rule not found.")

    before = {k: v for k, v in row.__dict__.items() if not k.startswith("_")}
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.flush()
    after = {k: v for k, v in row.__dict__.items() if not k.startswith("_")}
    write_audit(
        db,
        client_id=row.client_id,
        partner_id=str(row.partner_id),
        entity_type="RULE",
        entity_id=str(row.rule_id),
        action="UPDATE",
        before_json=before,
        after_json=after,
        actor_email=payload.updated_by,
    )
    db.commit()
    db.refresh(row)
    return row


@router.delete("/business-rules/{rule_id}")
def delete_business_rule(rule_id: UUID, db: Session = Depends(get_db)):
    row = db.query(TradingPartnerBusinessRule).filter(TradingPartnerBusinessRule.rule_id == rule_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Business rule not found.")

    before = {k: v for k, v in row.__dict__.items() if not k.startswith("_")}
    write_audit(
        db,
        client_id=row.client_id,
        partner_id=str(row.partner_id),
        entity_type="RULE",
        entity_id=str(row.rule_id),
        action="DELETE",
        before_json=before,
        after_json=None,
    )
    db.delete(row)
    db.commit()
    return {"status": "success", "message": "Business rule deleted."}


@router.post("/{partner_id}/business-rules/evaluate")
def evaluate_rules(partner_id: UUID, payload: dict[str, Any], db: Session = Depends(get_db)):
    return {
        "results": evaluate_business_rules(
            db,
            client_id=payload["client_id"],
            partner_id=partner_id,
            payload=payload.get("document_json") or {},
            document_type=payload.get("document_type", "PO"),
            message_direction=payload.get("message_direction", "INBOUND"),
        )
    }


# MAPPING PROFILES
@router.get("/{partner_id}/mapping-profiles", response_model=list[TradingPartnerMappingProfileRead])
def list_mapping_profiles(partner_id: UUID, db: Session = Depends(get_db)):
    return (
        db.query(TradingPartnerMappingProfile)
        .filter(TradingPartnerMappingProfile.partner_id == partner_id)
        .order_by(TradingPartnerMappingProfile.priority.asc(), TradingPartnerMappingProfile.version_no.desc())
        .all()
    )


@router.post("/{partner_id}/mapping-profiles", response_model=TradingPartnerMappingProfileRead)
def create_mapping_profile(partner_id: UUID, payload: TradingPartnerMappingProfileCreate, db: Session = Depends(get_db)):
    if payload.partner_id != partner_id:
        raise HTTPException(status_code=400, detail="partner_id mismatch.")
    row = TradingPartnerMappingProfile(**payload.model_dump())
    db.add(row)
    db.flush()
    write_audit(
        db,
        client_id=payload.client_id,
        partner_id=str(payload.partner_id),
        entity_type="MAPPING",
        entity_id=str(row.mapping_profile_id),
        action="CREATE",
        before_json=None,
        after_json=payload.model_dump(mode="json"),
        actor_email=payload.created_by,
    )
    db.commit()
    db.refresh(row)
    return row


@router.put("/mapping-profiles/{mapping_profile_id}", response_model=TradingPartnerMappingProfileRead)
def update_mapping_profile(mapping_profile_id: UUID, payload: TradingPartnerMappingProfileUpdate, db: Session = Depends(get_db)):
    row = db.query(TradingPartnerMappingProfile).filter(TradingPartnerMappingProfile.mapping_profile_id == mapping_profile_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Mapping profile not found.")

    before = {k: v for k, v in row.__dict__.items() if not k.startswith("_")}
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.flush()
    after = {k: v for k, v in row.__dict__.items() if not k.startswith("_")}
    write_audit(
        db,
        client_id=row.client_id,
        partner_id=str(row.partner_id),
        entity_type="MAPPING",
        entity_id=str(row.mapping_profile_id),
        action="UPDATE",
        before_json=before,
        after_json=after,
        actor_email=payload.updated_by,
    )
    db.commit()
    db.refresh(row)
    return row


@router.delete("/mapping-profiles/{mapping_profile_id}")
def delete_mapping_profile(mapping_profile_id: UUID, db: Session = Depends(get_db)):
    row = db.query(TradingPartnerMappingProfile).filter(TradingPartnerMappingProfile.mapping_profile_id == mapping_profile_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Mapping profile not found.")

    before = {k: v for k, v in row.__dict__.items() if not k.startswith("_")}
    write_audit(
        db,
        client_id=row.client_id,
        partner_id=str(row.partner_id),
        entity_type="MAPPING",
        entity_id=str(row.mapping_profile_id),
        action="DELETE",
        before_json=before,
        after_json=None,
    )
    db.delete(row)
    db.commit()
    return {"status": "success", "message": "Mapping profile deleted."}


@router.post("/{partner_id}/mapping-profiles/resolve")
def resolve_mapping_profile(partner_id: UUID, payload: dict[str, Any], db: Session = Depends(get_db)):
    profile = find_mapping_profile(
        db,
        client_id=payload["client_id"],
        partner_id=partner_id,
        document_type=payload.get("document_type", "PO"),
        input_format=payload.get("input_format", "PDF"),
        sold_to=payload.get("sold_to"),
        ship_to=payload.get("ship_to"),
    )
    if not profile:
        raise HTTPException(status_code=404, detail="No active mapping profile found.")
    return profile


# AUDIT
@router.get("/{partner_id}/onboarding-audit", response_model=list[TradingPartnerOnboardingAuditRead])
def list_onboarding_audit(partner_id: UUID, db: Session = Depends(get_db)):
    return (
        db.query(TradingPartnerOnboardingAudit)
        .filter(TradingPartnerOnboardingAudit.partner_id == partner_id)
        .order_by(TradingPartnerOnboardingAudit.created_at.desc())
        .all()
    )
