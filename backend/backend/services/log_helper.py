from backend.api.realtime_api import push_update
import asyncio
from backend.db import models

def write_log(db, po, stage, message, level="INFO", user=None):
    log = models.PoLog(
        po_id=po.po_id,
        client_id=po.client_id,
        stage=stage,
        message=message,
        level=level,
        created_by=user,
    )
    db.add(log)
    db.commit()

    asyncio.create_task(push_update(str(po.po_id), {
        "stage": stage,
        "message": message,
        "level": level,
    }))
