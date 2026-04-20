import csv
import io
from sqlalchemy.orm import Session
from backend.db import models

def generate_uom_template():
    headers = ["customer_code","supplier_code","ship_to_code","material_code","product_code","input_uom","output_uom","conversion_factor","conversion_divider","rounding_digits","priority","is_active","notes"]
    output = io.StringIO(); writer = csv.writer(output); writer.writerow(headers); writer.writerow(["","","","","","EA","EA","1","1","2","100","TRUE",""])
    return output.getvalue()

def upload_uom_csv(db: Session, partner_id, file_bytes: bytes):
    text = file_bytes.decode("utf-8-sig"); reader = csv.DictReader(io.StringIO(text)); count = 0
    for row in reader:
        if not str(row.get("input_uom", "")).strip() or not str(row.get("output_uom", "")).strip(): continue
        db.add(models.PartnerUomRule(partner_id=partner_id, customer_code=(row.get("customer_code") or None), supplier_code=(row.get("supplier_code") or None), ship_to_code=(row.get("ship_to_code") or None), material_code=(row.get("material_code") or None), product_code=(row.get("product_code") or None), input_uom=str(row.get("input_uom")).strip(), output_uom=str(row.get("output_uom")).strip(), conversion_factor=float(row["conversion_factor"]) if row.get("conversion_factor") else None, conversion_divider=float(row["conversion_divider"]) if row.get("conversion_divider") else None, rounding_digits=int(row["rounding_digits"]) if row.get("rounding_digits") else 2, priority=int(row["priority"]) if row.get("priority") else 100, is_active=str(row.get("is_active", "TRUE")).upper() in ("TRUE", "YES", "1"), notes=(row.get("notes") or None)))
        count += 1
    db.commit(); return {"uploaded_count": count}
