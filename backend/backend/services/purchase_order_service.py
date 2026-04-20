from __future__ import annotations

from datetime import datetime
from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from backend.db import models, schemas
from backend.core.deps import UserContext
from backend.services.xml_service import generate_xml_for_po
from backend.services.vendor_learning_service import vendor_learning_service
from backend.services.idoc_mapping_orchestrator import orchestrate_mapping_and_rules
from backend.services.adapter_registry import get_target_adapter
from backend.services.connector_registry import get_connector
from backend.services.parsed_payload_builder import build_parsed_payload_from_po



def parse_date_safe(value):
    if value in [None, ""]:
        return None
    try:
        return datetime.fromisoformat(str(value)).date()
    except Exception:
        return None


class PurchaseOrderService:
    def list_purchase_orders(
        self,
        db: Session,
        *,
        client_id: str | None = None,
        status_filter: str | None = None,
    ):
        query = db.query(models.PurchaseOrder).options(
            joinedload(models.PurchaseOrder.items)
        )
        if client_id:
          query = query.filter(models.PurchaseOrder.client_id == client_id)
        if status_filter:
          query = query.filter(models.PurchaseOrder.status == status_filter)
        return query.order_by(models.PurchaseOrder.created_at.desc()).all()

    def get_purchase_order(self, db: Session, po_id):
        po = (
            db.query(models.PurchaseOrder)
            .options(joinedload(models.PurchaseOrder.items))
            .filter(models.PurchaseOrder.po_id == po_id)
            .first()
        )
        if not po:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Purchase order not found.",
            )
        return po

    def _write_log(
        self,
        db: Session,
        po,
        level: str,
        stage: str,
        message: str,
        created_by: str | None,
    ):
        db.add(
            models.PoLog(
                po_id=po.po_id,
                client_id=po.client_id,
                level=level,
                stage=stage,
                message=message,
                created_by=created_by,
            )
        )
        db.add(
            models.AuditLog(
                client_id=po.client_id,
                entity_type="PURCHASE_ORDER",
                entity_id=str(po.po_id),
                action=stage,
                old_value_json=None,
                new_value_json={"message": message},
                actor_email=created_by,
                actor_role=None,
            )
        )

    def update_purchase_order(
        self,
        db: Session,
        po_id,
        payload: schemas.PurchaseOrderUpdate,
        user_ctx: UserContext,
    ):
        po = self.get_purchase_order(db, po_id)
        previous_mappings = list(getattr(po, "mappings_json", None) or [])

        try:
            if getattr(payload, "po_number", None) is not None:
                po.po_number = payload.po_number

            if getattr(payload, "po_date", None) is not None:
                po.po_date = parse_date_safe(payload.po_date)

            if getattr(payload, "sender", None) is not None:
                po.sender = payload.sender

            if getattr(payload, "receiver", None) is not None:
                po.receiver = payload.receiver

            if getattr(payload, "po_type", None) is not None:
                po.po_type = payload.po_type

            if getattr(payload, "order_type", None) is not None:
                po.order_type = payload.order_type

            if getattr(payload, "language_code", None) is not None:
                po.language_code = payload.language_code

            if getattr(payload, "currency", None) is not None:
                po.currency = payload.currency

            if getattr(payload, "ship_to", None) is not None:
                po.ship_to = payload.ship_to

            if getattr(payload, "ship_to_name", None) is not None:
                po.ship_to_name = payload.ship_to_name

            if getattr(payload, "ship_to_address", None) is not None:
                po.ship_to_address = payload.ship_to_address

            if getattr(payload, "header_details", None) is not None:
                po.header_details = payload.header_details

            if getattr(payload, "sold_to", None) is not None:
                po.sold_to = payload.sold_to

            if getattr(payload, "po_validation_reason", None) is not None:
                po.po_validation_reason = payload.po_validation_reason

            if getattr(payload, "raw_text", None) is not None:
                po.raw_text = payload.raw_text

            if payload.items is not None:
                existing_items = {
                    int(item.line_no): item
                    for item in db.query(models.PurchaseOrderItem)
                    .filter(models.PurchaseOrderItem.po_id == po_id)
                    .all()
                    if item.line_no is not None
                }

                for item in payload.items:
                    if item.line_no is None:
                        continue

                    line_no = int(item.line_no)
                    if line_no <= 0:
                        continue

                    if line_no in existing_items:
                        db_item = existing_items[line_no]

                        if item.material_code is not None:
                            db_item.material_code = item.material_code
                        if item.description is not None:
                            db_item.description = item.description
                        if item.quantity is not None:
                            db_item.quantity = item.quantity
                        if item.uom is not None:
                            db_item.uom = item.uom
                        if item.unit_price is not None:
                            db_item.unit_price = item.unit_price
                        if item.amount is not None:
                            db_item.amount = item.amount
                        if item.delivery_date is not None:
                            db_item.delivery_date = parse_date_safe(item.delivery_date)
                        if item.plant is not None:
                            db_item.plant = item.plant

                        db_item.is_corrected = True
                    else:
                        db.add(
                            models.PurchaseOrderItem(
                                po_id=po.po_id,
                                line_no=line_no,
                                material_code=item.material_code,
                                description=item.description,
                                quantity=item.quantity,
                                uom=item.uom,
                                unit_price=item.unit_price,
                                amount=item.amount,
                                delivery_date=parse_date_safe(item.delivery_date),
                                plant=item.plant,
                                is_corrected=True,
                            )
                        )

            if payload.mappings is not None:
               existing_resolution_map = dict(getattr(po, "mapping_resolution_json", None) or {})
               existing_boxes_map = dict(getattr(po, "field_boxes_json", None) or {})

               for m in payload.mappings:
                   bbox_value = (
                       m.bbox.model_dump()
                       if getattr(m, "bbox", None) is not None
                       else None
                   )

                   existing_resolution_map[m.key] = {
                       "value": m.value,
                       "text": getattr(m, "text", None),
                       "source": getattr(m, "source", None),
                       "confidence": getattr(m, "confidence", None),
                   }

                   if bbox_value:
                       existing_boxes_map[m.key] = bbox_value

               po.mapping_resolution_json = existing_resolution_map
               po.field_boxes_json = existing_boxes_map

            po.status = "CORRECTED"
            po.updated_at = models.func.now()
            db.add(po)

            self._write_log(
                db,
                po,
                "INFO",
                "USER_UPDATE",
                "Purchase order updated from Message Monitor.",
                getattr(user_ctx, "email", None),
            )
            
            print("mapping_resolution_json to save =", po.mapping_resolution_json)
            print("field_boxes_json to save =", po.field_boxes_json)             

            db.commit()
            db.refresh(po)

            try:
                vendor_learning_service.learn_corrected_fields_from_purchase_order(
                    db,
                    po,
                    approved_by=getattr(user_ctx, "email", None),
                    previous_mappings=previous_mappings,
                )
                db.commit()
            except Exception as learn_err:
                print("VENDOR LEARNING WARNING:", learn_err)
                db.rollback()

            return po

        except Exception as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Update failed: {str(e)}",
            ) 
    

    def process_purchase_order(self, db: Session, po_id, user_ctx: UserContext) -> dict:
        po = self.get_purchase_order(db, po_id)

        po.status = "TRANSFORMED"
        po.retry_count = po.retry_count or 0
        db.add(po)

        self._write_log(
            db,
            po,
            "INFO",
            "PROCESS_START",
            "Purchase order processing started.",
            getattr(user_ctx, "email", None),
        )

        db.commit()

        try:
            # ===============================
            # STEP 1 — CANONICAL PIPELINE
            # ===============================
            pipeline_result = orchestrate_mapping_and_rules(
                db,
                client_id=po.client_id,
                parsed_data={
                    "raw_text": po.raw_text,
                    "header": po.header_details or {},
                    "items": [
                        {
                            "line_no": item.line_no,
                            "material_code": item.material_code,
                            "description": item.description,
                            "quantity": item.quantity,
                            "uom": item.uom,
                            "unit_price": item.unit_price,
                            "amount": item.amount,
                            "delivery_date": str(item.delivery_date) if item.delivery_date else None,
                            "plant": item.plant,
                        }
                        for item in po.items
                    ],
                },
            )

            canonical = pipeline_result.get("som") or {}

            # ===============================
            # STEP 2 — STORE CANONICAL
            # ===============================
            po.canonical_json = canonical

            # ===============================
            # STEP 3 — FLOW + ADAPTER
            # ===============================
            flow = None
            if hasattr(models, "MessageFlow"):
                flow = (
                    db.query(models.MessageFlow)
                    .filter(
                        models.MessageFlow.partner_id == po.partner_id,
                        models.MessageFlow.document_type == "PO",
                        models.MessageFlow.is_active == True,
                    )
                    .order_by(models.MessageFlow.priority.asc())
                    .first()
                )

            adapter = get_target_adapter(
                target_erp=(flow.target_erp if flow else "SAP"),
                target_standard=(flow.target_message_standard if flow else "IDOC"),
                target_message_type=(flow.target_message_type if flow else "ORDERS"),
                target_message_version=(flow.target_message_version if flow else "ORDERS05"),
            )

            built = adapter.build(canonical, flow=flow)

            output_payload = built["payload"]

            # Save payload
            if hasattr(po, "target_payload_json") and built["content_type"] == "application/json":
                po.target_payload_json = output_payload

            if hasattr(po, "xml_payload") and built["content_type"] == "application/xml":
                po.xml_payload = output_payload

            # ===============================
            # STEP 4 — CONNECTOR (DELIVERY)
            # ===============================
            delivery_result = None

            try:
                if flow and getattr(flow, "auto_send_on_success", False):
                    connection_row = None

                    if getattr(flow, "target_connection_id", None):
                        connection_row = (
                            db.query(models.TradingPartnerConnection)
                            .filter(models.TradingPartnerConnection.connection_id == flow.target_connection_id)
                            .first()
                        )

                    if connection_row:
                        connector = get_connector(connection_row.connection_type)

                        delivery_result = connector.send(
                            payload=output_payload,
                            content_type=built["content_type"],
                            file_extension=built["file_extension"],
                            connection={
                                "host": connection_row.host,
                                "port": connection_row.port,
                                "username": connection_row.username,
                                "password": connection_row.password,
                                "remote_path": connection_row.remote_path,
                                "folder_path": connection_row.folder_path,
                                "endpoint_url": connection_row.endpoint_url,
                                "http_method": connection_row.http_method,
                                "auth_type": connection_row.auth_type,
                                "token": connection_row.token,
                                "headers": connection_row.headers_json,
                                "timeout_seconds": connection_row.timeout_seconds,
                                "target_directory": connection_row.target_directory,
                            },
                            filename=f"{po.po_number or po.po_id}.{built['file_extension']}",
                        )

            except Exception as delivery_err:
                delivery_result = {
                    "status": "FAILED",
                    "connector": getattr(connector, "connector_name", None),
                    "response_text": str(delivery_err),
                }

            # ===============================
            # STEP 5 — STORE DELIVERY RESULT
            # ===============================
            if delivery_result:
                po.connector_used = delivery_result.get("connector")
                po.delivery_status = delivery_result.get("status")
                po.delivery_endpoint = (
                    delivery_result.get("url")
                    or delivery_result.get("host")
                    or delivery_result.get("location")
                )
                po.delivery_reference = (
                    delivery_result.get("remote_file")
                    or delivery_result.get("filename")
                )
                po.delivery_response_text = delivery_result.get("response_text")
                po.delivered_at = models.func.now()

            # ===============================
            # STEP 6 — LOG DELIVERY
            # ===============================
            self._write_log(
                db,
                po,
                "INFO" if delivery_result and delivery_result.get("status") == "SUCCESS" else "ERROR",
                "DELIVERY",
                "Payload delivery attempted.",
                getattr(user_ctx, "email", None),
                new_value_json={
                    "connector": delivery_result.get("connector") if delivery_result else None,
                    "status": delivery_result.get("status") if delivery_result else None,
                    "response": delivery_result.get("response_text") if delivery_result else None,
                    "endpoint": po.delivery_endpoint,
                    "file": po.delivery_reference,
                    "adapter": built["meta"].get("adapter"),
                    "content_type": built["content_type"],
                },
            )

            # ===============================
            # FINALIZE
            # ===============================
            po.status = "PROCESSED"
            po.processed_at = models.func.now()

            db.add(po)

            self._write_log(
                db,
                po,
                "INFO",
                "PROCESS_COMPLETE",
                "Purchase order processed successfully.",
                getattr(user_ctx, "email", None),
            )

            db.commit()
            db.refresh(po)

            return {
                "status": "SUCCESS",
                "po_id": str(po.po_id),
                "output_payload": output_payload,
                "delivery_result": delivery_result,
                "canonical": canonical,
            }

        except Exception as e:
            db.rollback()

            po.status = "ERROR"
            po.retry_count = (po.retry_count or 0) + 1
            db.add(po)

            self._write_log(
                db,
                po,
                "ERROR",
                "PROCESS_FAILED",
                str(e),
                getattr(user_ctx, "email", None),
            )

            db.commit()

            raise HTTPException(status_code=500, detail=str(e))

    def reprocess_purchase_order(self, db: Session, po_id, user_ctx: UserContext) -> dict:
        po = self.get_purchase_order(db, po_id)
        po.retry_count = (po.retry_count or 0) + 1
        po.status = "REPROCESSING"
        db.add(po)

        self._write_log(
            db,
            po,
            "INFO",
            "REPROCESS",
            "Purchase order reprocessing started.",
            getattr(user_ctx, "email", None),
        )

        db.commit()

        result = self.process_purchase_order(db, po_id, user_ctx)
        result["retry_count"] = po.retry_count
        result["message"] = "Purchase order reprocessed successfully."
        return result
    
    def reprocess_with_override(self, db: Session, po_id, payload, user_ctx):
        po = self.get_purchase_order(db, po_id)

        po.retry_count = (po.retry_count or 0) + 1
        po.status = "REPROCESSING"
        db.add(po)

        self._write_log(
            db,
            po,
            "INFO",
            "REPROCESS_OVERRIDE",
            "Reprocessing with override started.",
            getattr(user_ctx, "email", None),
        )

        db.commit()

        try:
            # =========================================
            # STEP 1 — REBUILD CANONICAL
            # =========================================
            pipeline_result = orchestrate_mapping_and_rules(
                db,
                client_id=po.client_id,
                parsed_data=self._build_parsed_payload(po),
            )

            canonical = pipeline_result.get("canonical") or pipeline_result.get("som")
            po.canonical_json = canonical

            # =========================================
            # STEP 2 — APPLY OVERRIDE (if provided)
            # =========================================
            target_erp = payload.target_erp or "SAP"
            message_type = payload.message_type or "ORDERS"
            message_version = payload.message_version or "ORDERS05"

            adapter = get_target_adapter(
                target_erp=target_erp,
                target_standard="IDOC",  # you can make dynamic later
                target_message_type=message_type,
                target_message_version=message_version,
            )

            built = adapter.build(canonical)

            # store payload
            if built["content_type"] == "application/xml":
                po.xml_payload = built["payload"]
            else:
                po.target_payload_json = built["payload"]

            # =========================================
            # STEP 3 — OPTIONAL DELIVERY
            # =========================================
            delivery_result = None

            if payload.connection_id:
                connection = (
                    db.query(models.TradingPartnerConnection)
                    .filter(models.TradingPartnerConnection.connection_id == payload.connection_id)
                    .first()
                )

                if connection:
                    connector = get_connector(connection.connection_type)

                    delivery_result = connector.send(
                        payload=built["payload"],
                        content_type=built["content_type"],
                        file_extension=built["file_extension"],
                        connection={
                            "host": connection.host,
                            "port": connection.port,
                            "username": connection.username,
                            "password": connection.password,
                            "endpoint_url": connection.endpoint_url,
                            "remote_path": connection.remote_path,
                        },
                        filename=f"{po.po_number or po.po_id}.{built['file_extension']}",
                    )

            # =========================================
            # FINALIZE
            # =========================================
            po.status = "PROCESSED"
            po.processed_at = models.func.now()

            db.add(po)

            self._write_log(
                db,
                po,
                "INFO",
                "REPROCESS_OVERRIDE_COMPLETE",
                "Reprocessing with override completed.",
                getattr(user_ctx, "email", None),
            )

            db.commit()
            db.refresh(po)

            return {
                "status": "SUCCESS",
                "po_id": str(po.po_id),
                "retry_count": po.retry_count,
                "output_payload": built["payload"],
                "delivery_result": delivery_result,
                "canonical": canonical,
            }

        except Exception as e:
            db.rollback()

            po.status = "ERROR"
            db.add(po)

            self._write_log(
                db,
                po,
                "ERROR",
                "REPROCESS_OVERRIDE_FAILED",
                str(e),
                getattr(user_ctx, "email", None),
            )

            db.commit()

            raise
     
    def retry_delivery(self, db: Session, po_id, user_ctx):
        po = self.get_purchase_order(db, po_id)

        if not po.xml_payload and not po.target_payload_json:
            raise HTTPException(
                status_code=400,
                detail="No existing payload to resend.",
            )

        # =========================================
        # LOAD FLOW
        # =========================================
        flow = None
        if hasattr(models, "MessageFlow"):
            flow = (
                db.query(models.MessageFlow)
                .filter(
                    models.MessageFlow.partner_id == po.partner_id,
                    models.MessageFlow.document_type == "PO",
                    models.MessageFlow.is_active == True,
                )
                .first()
            )

        if not flow or not flow.target_connection_id:
            raise HTTPException(
                status_code=400,
                detail="No connection configured for retry.",
            )

        connection = (
            db.query(models.TradingPartnerConnection)
            .filter(models.TradingPartnerConnection.connection_id == flow.target_connection_id)
            .first()
        )

        if not connection:
            raise HTTPException(status_code=404, detail="Connection not found")

        # =========================================
        # SEND AGAIN
        # =========================================
        connector = get_connector(connection.connection_type)

        payload = po.xml_payload or po.target_payload_json
        content_type = "application/xml" if po.xml_payload else "application/json"

        result = connector.send(
            payload=payload,
            content_type=content_type,
            file_extension="xml" if po.xml_payload else "json",
            connection={
                "host": connection.host,
                "port": connection.port,
                "username": connection.username,
                "password": connection.password,
                "endpoint_url": connection.endpoint_url,
                "remote_path": connection.remote_path,
            },
            filename=f"{po.po_number or po.po_id}.xml",
        )

        # =========================================
        # UPDATE STATUS
        # =========================================
        po.status = "DELIVERED" if result.get("success") else "DELIVERY_FAILED"
        po.delivered_at = models.func.now()

        db.add(po)

        self._write_log(
            db,
            po,
            "INFO",
            "RETRY_DELIVERY",
            "Delivery retried.",
            getattr(user_ctx, "email", None),
        )

        db.commit()
        db.refresh(po)

        return {
            "status": po.status,
            "delivery_result": result,
        }

    def _build_parsed_payload(self, po):
        return {
            "raw_text": po.raw_text,
            "header": po.header_details or {},
            "items": [
                {
                    "line_no": item.line_no,
                    "material_code": item.material_code,
                    "description": item.description,
                    "quantity": item.quantity,
                    "uom": item.uom,
                    "unit_price": item.unit_price,
                    "amount": item.amount,
                    "delivery_date": str(item.delivery_date) if item.delivery_date else None,
                    "plant": item.plant,
                }
                for item in po.items
            ],
        }

    def archive_purchase_order(
        self,
        db: Session,
        po_id,
        reason: str,
        comment: str | None,
        user_ctx: UserContext,
    ):
        po = self.get_purchase_order(db, po_id)
        po.status = "ARCHIVED"
        po.archive_reason = reason
        po.archive_comment = comment
        po.updated_at = models.func.now()
        db.add(po)

        self._write_log(
            db,
            po,
            "INFO",
            "ARCHIVE",
            f"Purchase order archived. Reason: {reason}",
            getattr(user_ctx, "email", None),
        )

        db.commit()
        db.refresh(po)
        return {"status": "SUCCESS", "message": "Archived successfully."}


purchase_order_service = PurchaseOrderService()