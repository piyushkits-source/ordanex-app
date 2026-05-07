
from __future__ import annotations

import json

from backend.celery_app import celery_app
from backend.db.database import SessionLocal
from backend.db import models
from backend.services.connector_registry import get_connector


def _connection_from_client_config(db, client_id: str) -> dict:
    row = (
        db.query(models.ClientConfig)
        .filter(
            models.ClientConfig.client_id == client_id,
            models.ClientConfig.config_type == "outbound_connection",
            models.ClientConfig.is_active == True,
        )
        .order_by(models.ClientConfig.updated_at.desc())
        .first()
    )
    return dict(row.config_value_json or {}) if row else {}


def _resolve_payload(po) -> tuple[str, str, str]:
    xml_payload = getattr(po, "xml_payload", None)
    json_payload = getattr(po, "target_payload_json", None)
    raw_text = getattr(po, "raw_text", None) or ""

    if xml_payload:
        return xml_payload, "application/xml", "xml"
    if json_payload:
        if isinstance(json_payload, str):
            payload_text = json_payload
        else:
            payload_text = json.dumps(json_payload, ensure_ascii=False)
        return payload_text, "application/json", "json"
    return raw_text, "text/plain", "txt"


@celery_app.task(name="backend.tasks.outbound.deliver_po")
def deliver_po(po_id: str) -> dict:
    db = SessionLocal()
    try:
        po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_id == po_id).first()
        if not po:
            return {"success": False, "message": f"PO {po_id} not found"}

        connection = _connection_from_client_config(db, po.client_id)
        connection_type = connection.get("connection_type") or connection.get("type")
        if not connection_type:
            return {"success": False, "message": "No active outbound connection configured"}

        connector = get_connector(connection_type)
        payload, content_type, file_extension = _resolve_payload(po)
        filename = f"{po.po_number or po.po_id}.{file_extension}"
        result = connector.send(
            payload=payload,
            content_type=content_type,
            file_extension=file_extension,
            connection=connection,
            filename=filename,
        )

        if hasattr(po, "delivery_status"):
            po.delivery_status = result.get("status")
        if hasattr(po, "connector_used"):
            po.connector_used = result.get("connector")
        if hasattr(po, "delivery_endpoint"):
            po.delivery_endpoint = result.get("remote_file") or result.get("url") or result.get("location")
        if hasattr(po, "delivery_reference"):
            po.delivery_reference = result.get("filename") or result.get("http_status")
        if hasattr(po, "delivery_response_text"):
            po.delivery_response_text = result.get("response_text")
        if hasattr(po, "delivery_result_json"):
            po.delivery_result_json = result
        db.add(po)
        db.commit()
        return {"success": result.get("status") == "SUCCESS", "po_id": po_id, "result": result}
    finally:
        db.close()


@celery_app.task(name="backend.tasks.outbound.retry_failed_outbound")
def retry_failed_outbound() -> dict:
    db = SessionLocal()
    try:
        q = db.query(models.PurchaseOrder)
        if hasattr(models.PurchaseOrder, "delivery_status"):
            q = q.filter(models.PurchaseOrder.delivery_status.in_(["FAILED", "ERROR"]))
        else:
            q = q.filter(models.PurchaseOrder.status.in_(["DELIVERY_FAILED", "ERROR"]))
        rows = q.order_by(models.PurchaseOrder.created_at.desc()).limit(50).all()
        count = 0
        for po in rows:
            deliver_po.delay(str(po.po_id))
            count += 1
        return {"queued": count}
    finally:
        db.close()
