import csv
import io
from sqlalchemy.orm import Session
from backend.db import models
REQUIRED_COLUMNS = ["partner_code", "partner_name", "partner_type"]
def parse_partner_csv(file_bytes: bytes):
    text = file_bytes.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for idx, row in enumerate(reader, start=2):
        errors = []
        for col in REQUIRED_COLUMNS:
            if not str(row.get(col, "")).strip(): errors.append(f"{col} is required")
        rows.append({"row_number": idx, "partner_code": str(row.get("partner_code", "")).strip(), "partner_name": str(row.get("partner_name", "")).strip(), "partner_type": str(row.get("partner_type", "CUSTOMER")).strip() or "CUSTOMER", "status": str(row.get("status", "ACTIVE")).strip() or "ACTIVE", "notes": str(row.get("notes", "")).strip(), "errors": errors, "is_valid": len(errors) == 0})
    return rows

def preview_partner_rows(db: Session, client_id: str, rows: list[dict], duplicate_mode: str):
    for row in rows:
        if not row["partner_code"]: continue
        existing = db.query(models.TradingPartner).filter(models.TradingPartner.client_id == client_id, models.TradingPartner.partner_code == row["partner_code"]).first()
        if existing and duplicate_mode == "REJECT": row["errors"].append("Duplicate partner_code exists"); row["is_valid"] = False
    return {"total_rows": len(rows), "valid_count": sum(1 for r in rows if r["is_valid"]), "invalid_count": sum(1 for r in rows if not r["is_valid"]), "rows": rows, "error_rows": [r for r in rows if not r["is_valid"]]}

def upload_partner_rows(db: Session, client_id: str, vertical_id, rows: list[dict], duplicate_mode: str):
    success = 0; failure = 0; errors = []
    for row in rows:
        if not row["is_valid"]: failure += 1; errors.append(row); continue
        existing = db.query(models.TradingPartner).filter(models.TradingPartner.client_id == client_id, models.TradingPartner.partner_code == row["partner_code"]).first()
        if existing:
            if duplicate_mode == "SKIP": continue
            if duplicate_mode == "REJECT": failure += 1; errors.append({**row, "errors": ["Duplicate partner_code exists"]}); continue
            existing.partner_name = row["partner_name"]; existing.partner_type = row["partner_type"]; existing.status = row["status"]; existing.notes = row["notes"]; db.add(existing); success += 1; continue
        obj = models.TradingPartner(client_id=client_id, vertical_id=vertical_id, partner_code=row["partner_code"], partner_name=row["partner_name"], partner_type=row["partner_type"], status=row["status"], notes=row["notes"])
        db.add(obj); success += 1
    db.commit(); return {"success_count": success, "failure_count": failure, "errors": errors}
