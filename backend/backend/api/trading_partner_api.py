from uuid import UUID
from pathlib import Path
import io

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Protection
from openpyxl.worksheet.datavalidation import DataValidation
from backend.services.excel_validation_engine import (
    validate_bulk_onboarding_workbook,
    validate_uom_workbook,
)

from backend.db.database import get_db
from backend.db import models, schemas

router = APIRouter(prefix="/trading-partners", tags=["Trading Partners"])

BASE_DIR = Path(__file__).resolve().parents[2]
TEMPLATE_DIR = BASE_DIR / "templates"


@router.get("", response_model=list[schemas.TradingPartnerRead])
def get_trading_partners(
    client_id: str,
    vertical_id: UUID | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.TradingPartner).filter(models.TradingPartner.client_id == client_id)
    if vertical_id:
        query = query.filter(models.TradingPartner.vertical_id == vertical_id)
    return query.order_by(models.TradingPartner.partner_name.asc()).all()


@router.post("", response_model=schemas.TradingPartnerRead)
def create_trading_partner(payload: schemas.TradingPartnerCreate, db: Session = Depends(get_db)):
    existing = (
        db.query(models.TradingPartner)
        .filter(
            models.TradingPartner.client_id == payload.client_id,
            models.TradingPartner.partner_code == payload.partner_code,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Trading partner already exists.")

    row = models.TradingPartner(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/{partner_id}", response_model=schemas.TradingPartnerRead)
def update_trading_partner(partner_id: UUID, payload: schemas.TradingPartnerUpdate, db: Session = Depends(get_db)):
    row = db.query(models.TradingPartner).filter(models.TradingPartner.partner_id == partner_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Trading partner not found.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)

    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/{partner_id}/profile", response_model=schemas.TradingPartnerProfileRead)
def get_partner_profile(partner_id: UUID, db: Session = Depends(get_db)):
    partner = db.query(models.TradingPartner).filter(models.TradingPartner.partner_id == partner_id).first()
    if not partner:
        raise HTTPException(status_code=404, detail="Trading partner not found.")

    row = db.query(models.TradingPartnerProfile).filter(models.TradingPartnerProfile.partner_id == partner_id).first()
    if row:
        return row

    default_profile = models.TradingPartnerProfile(
        client_id=partner.client_id,
        partner_id=partner.partner_id,
        profile_name="Default Profile",
        profile_status="ACTIVE",
        duplicate_check_enabled=True,
        duplicate_check_scope="PO_NUMBER",
        split_rule="NONE",
        split_po_number_strategy="SAME_PO_NUMBER",
        split_po_separator="-",
        delivery_date_source="PO_DELIVERY_DATE",
        delivery_date_offset_type="NONE",
        delivery_date_offset_days=0,
        po_date_source="PO_DATE",
        split_quantity_basis="ORDER_QTY",
        split_rounding_mode="UP",
    )
    db.add(default_profile)
    db.commit()
    db.refresh(default_profile)
    return default_profile


@router.post("/{partner_id}/profile", response_model=schemas.TradingPartnerProfileRead)
def save_partner_profile(partner_id: UUID, payload: schemas.TradingPartnerProfileCreate, db: Session = Depends(get_db)):
    partner = db.query(models.TradingPartner).filter(models.TradingPartner.partner_id == partner_id).first()
    if not partner:
        raise HTTPException(status_code=404, detail="Trading partner not found.")

    existing = db.query(models.TradingPartnerProfile).filter(models.TradingPartnerProfile.partner_id == partner_id).first()
    if existing:
        for field, value in payload.model_dump().items():
            setattr(existing, field, value)
        db.commit()
        db.refresh(existing)
        return existing

    row = models.TradingPartnerProfile(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/{partner_id}/connections", response_model=list[schemas.TradingPartnerConnectionRead])
def get_partner_connections(partner_id: UUID, db: Session = Depends(get_db)):
    return (
        db.query(models.TradingPartnerConnection)
        .filter(models.TradingPartnerConnection.partner_id == partner_id)
        .order_by(models.TradingPartnerConnection.created_at.desc())
        .all()
    )


@router.post("/{partner_id}/connections", response_model=schemas.TradingPartnerConnectionRead)
def create_partner_connection(
    partner_id: UUID,
    payload: schemas.TradingPartnerConnectionCreate,
    db: Session = Depends(get_db),
):
    partner = db.query(models.TradingPartner).filter(models.TradingPartner.partner_id == partner_id).first()
    if not partner:
        raise HTTPException(status_code=404, detail="Trading partner not found.")

    row = models.TradingPartnerConnection(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/connections/{connection_id}", response_model=schemas.TradingPartnerConnectionRead)
def update_partner_connection(
    connection_id: UUID,
    payload: schemas.TradingPartnerConnectionUpdate,
    db: Session = Depends(get_db),
):
    row = db.query(models.TradingPartnerConnection).filter(models.TradingPartnerConnection.connection_id == connection_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)

    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/connections/{connection_id}")
def delete_partner_connection(connection_id: UUID, db: Session = Depends(get_db)):
    row = db.query(models.TradingPartnerConnection).filter(models.TradingPartnerConnection.connection_id == connection_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found.")
    db.delete(row)
    db.commit()
    return {"status": "deleted"}

@router.get("/{partner_id}/uom/template")
def download_uom_template(partner_id: UUID):
    wb = Workbook()

    ws_info = wb.active
    ws_info.title = "Instructions"
    ws_info["A1"] = "UOM Template Instructions"
    ws_info["A1"].font = Font(bold=True, size=14)
    ws_info["A3"] = "1. Do not change header names"
    ws_info["A4"] = "2. Fill only data rows"
    ws_info["A5"] = "3. Upload back in same format"
    ws_info["A6"] = "4. Use dropdown values where available"

    ws = wb.create_sheet(title="UOM_Data")

    headers = [
        "client_id",
        "partner_id",
        "input_uom",
        "output_uom",
        "factor",
        "divider",
        "material_code",
        "rounding_digits",
        "rounding_mode",
        "is_active",
    ]
    ws.append(headers)

    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.fill = PatternFill(start_color="FFFF99", end_color="FFFF99", fill_type="solid")
        cell.protection = Protection(locked=True)

    for row in ws.iter_rows(min_row=2, max_row=500):
        for cell in row:
            cell.protection = Protection(locked=False)

    dv_rounding = DataValidation(type="list", formula1='"HALF_UP,FLOOR,CEILING"', allow_blank=True)
    ws.add_data_validation(dv_rounding)
    dv_rounding.add("I2:I500")

    dv_active = DataValidation(type="list", formula1='"TRUE,FALSE"', allow_blank=True)
    ws.add_data_validation(dv_active)
    dv_active.add("J2:J500")

    ws.protection.sheet = True

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)

    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=uom_template.xlsx"},
    )


@router.post("/{partner_id}/uom/upload")
async def upload_uom_template(
    partner_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    contents = await file.read()
    result = validate_uom_workbook(contents)

    if not result.is_valid:
        return StreamingResponse(
            io.BytesIO(result.workbook_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": "attachment; filename=uom_validation_errors.xlsx",
                "X-Upload-Status": "validation_failed",
            },
        )
    wb = load_workbook(filename=io.BytesIO(contents))
    ws = wb["UOM_Data"]

    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not any(row):
            continue

        rows.append(
            {
                "client_id": row[0],
                "partner_id": row[1],
                "input_uom": row[2],
                "output_uom": row[3],
                "factor": row[4],
                "divider": row[5],
                "material_code": row[6],
                "rounding_digits": row[7],
                "rounding_mode": row[8],
                "is_active": row[9],
            }
        )

    return {
        "status": "success",
        "rows_processed": len(result.parsed_rows),
        "rows": result.parsed_rows,
    }

@router.get("/{partner_id}/bulk-onboarding/template")
def download_bulk_onboarding_template(partner_id: UUID):
    wb = Workbook()

    ws_info = wb.active
    ws_info.title = "Instructions"
    ws_info["A1"] = "Bulk Onboarding Template Instructions"
    ws_info["A1"].font = Font(bold=True, size=14)
    ws_info["A3"] = "1. Do not change header names"
    ws_info["A4"] = "2. Fill only data rows"
    ws_info["A5"] = "3. Upload back in same format"
    ws_info["A6"] = "4. Use dropdown values where available"

    ws = wb.create_sheet(title="Bulk_Onboarding")

    headers = [
        "client_id",
        "vertical_id",
        "partner_code",
        "partner_name",
        "partner_type",
        "status",
        "connection_method",
        "email",
        "edi_id",
        "sftp_path",
        "as2_id",
        "api_reference",
        "notes",
    ]
    ws.append(headers)

    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.fill = PatternFill(start_color="FFFF99", end_color="FFFF99", fill_type="solid")
        cell.protection = Protection(locked=True)

    for row in ws.iter_rows(min_row=2, max_row=500):
        for cell in row:
            cell.protection = Protection(locked=False)

    dv_partner_type = DataValidation(type="list", formula1='"CUSTOMER,SUPPLIER,LOGISTICS_PROVIDER"', allow_blank=True)
    ws.add_data_validation(dv_partner_type)
    dv_partner_type.add("E2:E500")

    dv_status = DataValidation(type="list", formula1='"ACTIVE,INACTIVE"', allow_blank=True)
    ws.add_data_validation(dv_status)
    dv_status.add("F2:F500")

    dv_connection = DataValidation(type="list", formula1='"EMAIL,EDI,SFTP,AS2,API"', allow_blank=True)
    ws.add_data_validation(dv_connection)
    dv_connection.add("G2:G500")

    ws.protection.sheet = True

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)

    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=bulk_onboarding_template.xlsx"},
    )


@router.post("/{partner_id}/bulk-onboarding/upload")
async def upload_bulk_onboarding(
    partner_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    contents = await file.read()
    result = validate_bulk_onboarding_workbook(contents)

    if not result.is_valid:
        return StreamingResponse(
            io.BytesIO(result.workbook_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": "attachment; filename=bulk_onboarding_validation_errors.xlsx",
                "X-Upload-Status": "validation_failed",
            },
        )
    wb = load_workbook(filename=io.BytesIO(contents))
    ws = wb["Bulk_Onboarding"]

    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not any(row):
            continue

        rows.append(
            {
                "client_id": row[0],
                "vertical_id": row[1],
                "partner_code": row[2],
                "partner_name": row[3],
                "partner_type": row[4],
                "status": row[5],
                "connection_method": row[6],
                "email": row[7],
                "edi_id": row[8],
                "sftp_path": row[9],
                "as2_id": row[10],
                "api_reference": row[11],
                "notes": row[12],
            }
        )

    return {
        "status": "success",
        "rows_processed": len(result.parsed_rows),
        "rows": result.parsed_rows,
    }

@router.get("/{partner_id}/mappings")
def get_partner_mappings(partner_id: UUID, db: Session = Depends(get_db)):
    if not hasattr(models, "TradingPartnerMapping"):
        return []

    rows = (
        db.query(models.TradingPartnerMapping)
        .filter(models.TradingPartnerMapping.partner_id == partner_id)
        .order_by(models.TradingPartnerMapping.created_at.desc())
        .all()
    )
    return rows

@router.get("/uom-rules")
def get_uom_rules(partner_id: UUID, db: Session = Depends(get_db)):
    if not hasattr(models, "TradingPartnerUomRule"):
        return []

    rows = (
        db.query(models.TradingPartnerUomRule)
        .filter(models.TradingPartnerUomRule.partner_id == partner_id)
        .order_by(models.TradingPartnerUomRule.created_at.desc())
        .all()
    )
    return rows