from __future__ import annotations
import csv, io
from typing import Optional, Any
from uuid import UUID
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from pydantic import BaseModel, Field
from backend.db.database import get_db
from backend.db import models, schemas
from backend.services.rbac import get_current_user, enforce_client_scope, require_roles
from backend.db import models_partner_universal_patch as upmodels
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/partner-onboarding-v2", tags=["Partner Onboarding V2"])

class TradingPartnerIn(BaseModel):
    client_id: str
    partner_code: str
    partner_name: str
    partner_type: str
    status: str = "ACTIVE"
    connection_method: Optional[str] = None
    email: Optional[str] = None
    edi_id: Optional[str] = None
    sftp_path: Optional[str] = None
    as2_id: Optional[str] = None
    api_reference: Optional[str] = None
    notes: Optional[str] = None

class ProfileIn(BaseModel):
    client_id: str
    partner_id: UUID
    profile_name: str = "Default Profile"
    profile_status: str = "ACTIVE"
    duplicate_check_enabled: bool = True
    duplicate_check_scope: str = "PO_NUMBER"
    split_rule: str = "NONE"
    split_po_number_strategy: str = "SAME_PO_NUMBER"
    split_po_separator: str = "-"
    delivery_date_source: str = "PO_DELIVERY_DATE"
    delivery_date_offset_type: str = "NONE"
    delivery_date_offset_days: int = 0
    po_date_source: str = "PO_DATE"

class UomRuleIn(BaseModel):
    client_id: str
    partner_id: UUID
    input_uom: str
    output_uom: str
    conversion_factor: Optional[float] = None
    conversion_divider: Optional[float] = None
    rounding_digits: int = 2
    is_active: bool = True
    notes: Optional[str] = None

@router.get("/bulk-template")
def download_template():
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["partner_code","partner_name","partner_type","status","connection_method","email","edi_id","sftp_path","as2_id","api_reference","notes"])
    w.writerow(["WAINBEE","WAINBEE LTD","SUPPLIER","ACTIVE","EMAIL","orders@wainbee.com","","","","","Sample supplier row"])
    out.seek(0)
    return StreamingResponse(iter([out.getvalue()]), media_type="text/csv", headers={"Content-Disposition":"attachment; filename=partner_onboarding_template.csv"})

@router.get("/partners")
def list_partners(client_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    enforce_client_scope(current_user, client_id)
    rows = db.query(upmodels.TradingPartner).filter(upmodels.TradingPartner.client_id == client_id, upmodels.TradingPartner.is_deleted == False).order_by(upmodels.TradingPartner.partner_name.asc()).all()
    return [{k:v for k,v in r.__dict__.items() if not k.startswith('_')} for r in rows]

@router.post("/partners")
def create_partner(payload: TradingPartnerIn, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    enforce_client_scope(current_user, payload.client_id)
    exists = db.query(upmodels.TradingPartner).filter(upmodels.TradingPartner.client_id == payload.client_id, upmodels.TradingPartner.partner_code == payload.partner_code, upmodels.TradingPartner.is_deleted == False).first()
    if exists:
        raise HTTPException(status_code=400, detail="Partner code already exists for this client")
    row = upmodels.TradingPartner(**payload.model_dump())
    db.add(row); db.commit(); db.refresh(row)
    return {k:v for k,v in row.__dict__.items() if not k.startswith('_')}

@router.delete("/partners/{partner_id}")
def delete_partner(partner_id: str, db: Session = Depends(get_db), current_user=Depends(require_roles("super_admin", "client_admin"))):
    row = db.query(upmodels.TradingPartner).filter(upmodels.TradingPartner.partner_id == partner_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Partner not found")
    enforce_client_scope(current_user, row.client_id)
    row.is_deleted = True; row.deleted_by = current_user.email
    db.add(row); db.commit()
    return {"message": "Partner deleted successfully"}

@router.get("/profiles/{partner_id}")
def get_profile(partner_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    partner = db.query(upmodels.TradingPartner).filter(upmodels.TradingPartner.partner_id == partner_id).first()
    if not partner: raise HTTPException(status_code=404, detail="Partner not found")
    enforce_client_scope(current_user, partner.client_id)
    row = db.query(upmodels.PartnerOnboardingProfile).filter(upmodels.PartnerOnboardingProfile.partner_id == partner_id).first()
    return None if not row else {k:v for k,v in row.__dict__.items() if not k.startswith('_')}

@router.post("/profiles")
def upsert_profile(payload: ProfileIn, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    enforce_client_scope(current_user, payload.client_id)
    row = db.query(upmodels.PartnerOnboardingProfile).filter(upmodels.PartnerOnboardingProfile.partner_id == payload.partner_id).first()
    if row:
        for k,v in payload.model_dump().items(): setattr(row,k,v)
    else:
        row = upmodels.PartnerOnboardingProfile(**payload.model_dump())
    db.add(row); db.commit(); db.refresh(row)
    return {k:v for k,v in row.__dict__.items() if not k.startswith('_')}

@router.get("/uom-rules/{uom_rule_id}/audit")
def get_uom_rule_audit(
    uom_rule_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    row = db.query(models.PartnerUomRule).filter(models.PartnerUomRule.uom_rule_id == uom_rule_id).first()

    if row:
        enforce_client_scope(current_user, row.client_id)

    logs = (
        db.query(models.AuditLog)
        .filter(
            models.AuditLog.entity_type == "PARTNER_UOM_RULE",
            models.AuditLog.entity_id == uom_rule_id,
        )
        .order_by(models.AuditLog.created_at.desc())
        .all()
    )

    return logs

@router.post("/uom-rules", response_model=schemas.PartnerUomRuleRead)
def create_uom_rule(
    payload: schemas.PartnerUomRuleCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    enforce_client_scope(current_user, payload.client_id)

    existing = (
        db.query(models.PartnerUomRule)
        .filter(
            models.PartnerUomRule.partner_id == payload.partner_id,
            models.PartnerUomRule.customer_code == payload.customer_code,
            models.PartnerUomRule.supplier_code == payload.supplier_code,
            models.PartnerUomRule.ship_to_code == payload.ship_to_code,
            models.PartnerUomRule.material_code == payload.material_code,
            models.PartnerUomRule.product_code == payload.product_code,
            models.PartnerUomRule.input_uom == payload.input_uom,
            models.PartnerUomRule.output_uom == payload.output_uom,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="UOM rule already exists for this scope")

    row = models.PartnerUomRule(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)

    audit = models.AuditLog(
        client_id=row.client_id,
        entity_type="PARTNER_UOM_RULE",
        entity_id=str(row.uom_rule_id),
        action="CREATE",
        old_value_json=None,
        new_value_json=payload.model_dump(),
        actor_email=current_user.email,
        actor_role=current_user.role,
    )
    db.add(audit)
    db.commit()

    return row

@router.put("/uom-rules/{uom_rule_id}", response_model=schemas.PartnerUomRuleRead)
def update_uom_rule(
    uom_rule_id: str,
    payload: schemas.PartnerUomRuleUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    row = db.query(models.PartnerUomRule).filter(models.PartnerUomRule.uom_rule_id == uom_rule_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="UOM rule not found")

    enforce_client_scope(current_user, row.client_id)

    old_data = {
        "customer_code": row.customer_code,
        "supplier_code": row.supplier_code,
        "ship_to_code": row.ship_to_code,
        "material_code": row.material_code,
        "product_code": row.product_code,
        "input_uom": row.input_uom,
        "output_uom": row.output_uom,
        "conversion_factor": row.conversion_factor,
        "conversion_divider": row.conversion_divider,
        "rounding_digits": row.rounding_digits,
        "priority": row.priority,
        "is_active": row.is_active,
        "notes": row.notes,
    }

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)

    db.add(row)
    db.commit()
    db.refresh(row)

    new_data = {
        "customer_code": row.customer_code,
        "supplier_code": row.supplier_code,
        "ship_to_code": row.ship_to_code,
        "material_code": row.material_code,
        "product_code": row.product_code,
        "input_uom": row.input_uom,
        "output_uom": row.output_uom,
        "conversion_factor": row.conversion_factor,
        "conversion_divider": row.conversion_divider,
        "rounding_digits": row.rounding_digits,
        "priority": row.priority,
        "is_active": row.is_active,
        "notes": row.notes,
    }

    audit = models.AuditLog(
        client_id=row.client_id,
        entity_type="PARTNER_UOM_RULE",
        entity_id=str(row.uom_rule_id),
        action="UPDATE",
        old_value_json=old_data,
        new_value_json=new_data,
        actor_email=current_user.email,
        actor_role=current_user.role,
    )
    db.add(audit)
    db.commit()

    return row

@router.delete("/uom-rules/{uom_rule_id}")
def delete_uom_rule(
    uom_rule_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    row = db.query(models.PartnerUomRule).filter(models.PartnerUomRule.uom_rule_id == uom_rule_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="UOM rule not found")

    enforce_client_scope(current_user, row.client_id)

    old_data = {
        "customer_code": row.customer_code,
        "supplier_code": row.supplier_code,
        "ship_to_code": row.ship_to_code,
        "material_code": row.material_code,
        "product_code": row.product_code,
        "input_uom": row.input_uom,
        "output_uom": row.output_uom,
        "conversion_factor": row.conversion_factor,
        "conversion_divider": row.conversion_divider,
        "rounding_digits": row.rounding_digits,
        "priority": row.priority,
        "is_active": row.is_active,
        "notes": row.notes,
    }

    audit = models.AuditLog(
        client_id=row.client_id,
        entity_type="PARTNER_UOM_RULE",
        entity_id=str(row.uom_rule_id),
        action="DELETE",
        old_value_json=old_data,
        new_value_json=None,
        actor_email=current_user.email,
        actor_role=current_user.role,
    )
    db.add(audit)

    db.delete(row)
    db.commit()

    return {"message": "UOM rule deleted successfully"}

@router.post("/bulk-preview")
def bulk_preview(client_id: str, file: UploadFile = File(...), duplicate_mode: str = "SKIP", db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    enforce_client_scope(current_user, client_id)
    content = file.file.read().decode("utf-8")
    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)
    required = {"partner_code","partner_name","partner_type","status","connection_method","email","edi_id","sftp_path","as2_id","api_reference","notes"}
    missing = required - set(reader.fieldnames or [])
    if missing: raise HTTPException(status_code=400, detail=f"Missing required columns: {', '.join(sorted(missing))}")
    preview=[]; error_rows=[]; valid=0; invalid=0; mode=duplicate_mode.upper()
    for idx,item in enumerate(rows, start=2):
        errs=[]; code=(item.get('partner_code') or '').strip(); name=(item.get('partner_name') or '').strip(); ptype=(item.get('partner_type') or '').strip().upper(); status=(item.get('status') or 'ACTIVE').strip().upper(); conn=(item.get('connection_method') or '').strip().upper()
        if not code: errs.append('partner_code is required')
        if not name: errs.append('partner_name is required')
        if ptype not in {'CUSTOMER','SUPPLIER'}: errs.append('partner_type must be CUSTOMER or SUPPLIER')
        exists = db.query(upmodels.TradingPartner).filter(upmodels.TradingPartner.client_id == client_id, upmodels.TradingPartner.partner_code == code, upmodels.TradingPartner.is_deleted == False).first() if code else None
        if exists and mode == 'REJECT': errs.append(f"partner_code '{code}' already exists")
        row={"row_number": idx, "partner_code": code, "partner_name": name, "partner_type": ptype, "status": status, "connection_method": conn, "email": (item.get('email') or '').strip(), "edi_id": (item.get('edi_id') or '').strip(), "sftp_path": (item.get('sftp_path') or '').strip(), "as2_id": (item.get('as2_id') or '').strip(), "api_reference": (item.get('api_reference') or '').strip(), "notes": (item.get('notes') or '').strip(), "errors": errs, "is_valid": len(errs)==0}
        preview.append(row)
        if errs: invalid += 1; error_rows.append(row)
        else: valid += 1
    return {"total_rows": len(preview), "valid_count": valid, "invalid_count": invalid, "rows": preview, "error_rows": error_rows}

@router.post("/bulk-upload")
def bulk_upload(client_id: str, file: UploadFile = File(...), duplicate_mode: str = "SKIP", db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    enforce_client_scope(current_user, client_id)
    content = file.file.read().decode("utf-8")
    reader = csv.DictReader(io.StringIO(content)); rows=list(reader)
    success_count=0; errors=[]; total=0; mode=duplicate_mode.upper()
    for idx,item in enumerate(rows, start=2):
        total += 1
        code=(item.get('partner_code') or '').strip(); name=(item.get('partner_name') or '').strip(); ptype=(item.get('partner_type') or '').strip().upper(); status=(item.get('status') or 'ACTIVE').strip().upper(); conn=(item.get('connection_method') or '').strip().upper()
        errs=[]
        if not code: errs.append('partner_code is required')
        if not name: errs.append('partner_name is required')
        if ptype not in {'CUSTOMER','SUPPLIER'}: errs.append('partner_type must be CUSTOMER or SUPPLIER')
        exists = db.query(upmodels.TradingPartner).filter(upmodels.TradingPartner.client_id == client_id, upmodels.TradingPartner.partner_code == code, upmodels.TradingPartner.is_deleted == False).first() if code else None
        if exists:
            if mode == 'REJECT': errs.append(f"partner_code '{code}' already exists")
            elif mode == 'SKIP': errors.append({"row_number": idx, "partner_code": code, "errors": [f"Skipped: partner_code '{code}' already exists"]}); continue
            elif mode == 'UPDATE':
                exists.partner_name=name; exists.partner_type=ptype; exists.status=status; exists.connection_method=conn or None; exists.email=(item.get('email') or '').strip() or None; exists.edi_id=(item.get('edi_id') or '').strip() or None; exists.sftp_path=(item.get('sftp_path') or '').strip() or None; exists.as2_id=(item.get('as2_id') or '').strip() or None; exists.api_reference=(item.get('api_reference') or '').strip() or None; exists.notes=(item.get('notes') or '').strip() or None
                db.add(exists); success_count += 1; continue
        if errs:
            errors.append({"row_number": idx, "partner_code": code, "errors": errs}); continue
        db.add(upmodels.TradingPartner(client_id=client_id, partner_code=code, partner_name=name, partner_type=ptype, status=status, connection_method=conn or None, email=(item.get('email') or '').strip() or None, edi_id=(item.get('edi_id') or '').strip() or None, sftp_path=(item.get('sftp_path') or '').strip() or None, as2_id=(item.get('as2_id') or '').strip() or None, api_reference=(item.get('api_reference') or '').strip() or None, notes=(item.get('notes') or '').strip() or None))
        success_count += 1
    db.commit()
    db.add(upmodels.PartnerBulkUploadLog(client_id=client_id, file_name=file.filename, total_records=total, success_count=success_count, failure_count=len(errors), status='COMPLETED', error_log_json=errors)); db.commit()
    return {"total_records": total, "success_count": success_count, "failure_count": len(errors), "errors": errors}
