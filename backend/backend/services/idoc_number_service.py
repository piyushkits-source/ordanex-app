from datetime import datetime
import re
from sqlalchemy.orm import Session
from sqlalchemy import select, update
from backend.db import models


def _sanitize(value: str, max_len=4):
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())[:max_len]


def generate_enterprise_docnum(db: Session, client_id: str, sender: str) -> str:
    """
    Enterprise DOCNUM:
    PREFIX + YYMMDD + SEQUENCE

    Example:
    DOWEXT250331000001
    """

    client = _sanitize(client_id, 3)
    sender = _sanitize(sender, 3)

    prefix = f"{client}{sender}"
    today = datetime.now().strftime("%y%m%d")

    # 🔒 LOCK ROW (important for concurrency)
    row = (
        db.query(models.IdocNumberRange)
        .with_for_update()
        .filter(models.IdocNumberRange.client_id == client_id)
        .first()
    )

    if not row:
        row = models.IdocNumberRange(
            client_id=client_id,
            prefix=prefix,
            last_number=1
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        sequence = 1
    else:
        sequence = row.last_number + 1
        row.last_number = sequence
        db.commit()

    seq_str = str(sequence).zfill(6)

    return f"{prefix}{today}{seq_str}"