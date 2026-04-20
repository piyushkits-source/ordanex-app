from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import datetime
from xml.dom import minidom

from sqlalchemy.orm import Session, joinedload

from backend.db import models
from backend.services.item_processing_service import build_posex


def generate_docnum(client_id: str, sender: str) -> str:
    now = datetime.now()
    ts = now.strftime("%y%m%d%H%M%S")
    client = re.sub(r"[^A-Z0-9]", "", (client_id or "GEN"))[:3]
    sender = re.sub(r"[^A-Z0-9]", "", (sender or "EXT"))[:3]
    return f"{client}{sender}{ts}01"


def _add(parent, tag, value):
    e = ET.SubElement(parent, tag)
    e.text = "" if value is None else str(value)


def _pretty_xml(root):
    return minidom.parseString(ET.tostring(root)).toprettyxml(indent="  ")


def get_item_processing_config_for_client(db: Session, client_id: str) -> dict:
    row = (
        db.query(models.ClientConfig)
        .filter(models.ClientConfig.client_id == client_id)
        .filter(models.ClientConfig.config_type == "item_processing_rules")
        .filter(models.ClientConfig.config_key == "default")
        .filter(models.ClientConfig.is_active == True)
        .order_by(models.ClientConfig.updated_at.desc())
        .first()
    )
    return row.config_value_json if row else {}


def build_orders05_xml(db: Session, po):
    root = ET.Element("ORDERS05")
    idoc = ET.SubElement(root, "IDOC")
    idoc.set("BEGIN", "1")

    if not po.docnum:
        po.docnum = generate_docnum(po.client_id, "EXTSYS")

    edi = ET.SubElement(idoc, "EDI_DC40")
    edi.set("SEGMENT", "1")
    _add(edi, "TABNAM", "EDI_DC40")
    _add(edi, "DOCNUM", po.docnum)
    _add(edi, "DIRECT", "2")
    _add(edi, "MESTYP", "ORDERS")
    _add(edi, "IDOCTYP", "ORDERS05")
    _add(edi, "SNDPOR", "EXTSYS")
    _add(edi, "RCVPOR", "SAPSYS")

    e1 = ET.SubElement(idoc, "E1EDK01")
    e1.set("SEGMENT", "1")
    _add(e1, "CURCY", po.currency or "EUR")
    _add(e1, "BSART", po.po_type or "NB")
    _add(e1, "AUART", po.order_type or "OR")

    e2 = ET.SubElement(idoc, "E1EDK02")
    e2.set("SEGMENT", "1")
    _add(e2, "QUALF", "001")
    _add(e2, "BELNR", po.po_number)

    if po.po_date:
        e3 = ET.SubElement(idoc, "E1EDK03")
        e3.set("SEGMENT", "1")
        _add(e3, "IDDAT", "012")
        _add(e3, "DATUM", po.po_date.strftime("%Y%m%d"))

    if po.sold_to:
        p = ET.SubElement(idoc, "E1EDKA1")
        p.set("SEGMENT", "1")
        _add(p, "PARVW", "AG")
        _add(p, "LIFNR", po.sold_to)

    if po.ship_to:
        p = ET.SubElement(idoc, "E1EDKA1")
        p.set("SEGMENT", "1")
        _add(p, "PARVW", "WE")
        _add(p, "LIFNR", po.ship_to)

    item_cfg = get_item_processing_config_for_client(db, po.client_id)
    print("🔥 XML ITEMS:", len(po.items or []))

    for idx, item in enumerate(po.items, start=1):
        seg = ET.SubElement(idoc, "E1EDP01")
        seg.set("SEGMENT", "1")
        posex = build_posex(
            {
                "line_no": item.line_no,
                "material": item.material_code,
                "delivery_date": item.delivery_date.strftime("%Y-%m-%d") if item.delivery_date else None,
            },
            idx,
            item_cfg,
        )

        _add(seg, "POSEX", posex)
        _add(seg, "MATNR", item.material_code)
        _add(seg, "MENGE", item.quantity)
        _add(seg, "MENEE", item.uom)
        _add(seg, "NETPR", item.unit_price)

        if item.delivery_date:
            sch = ET.SubElement(seg, "E1EDP20")
            sch.set("SEGMENT", "1")
            _add(sch, "EDATU", item.delivery_date.strftime("%Y%m%d"))

    return _pretty_xml(root)


def generate_xml_for_po(db: Session, po_id: str, created_by: str = "system"):
    po = (
        db.query(models.PurchaseOrder)
        .options(joinedload(models.PurchaseOrder.items))
        .filter(models.PurchaseOrder.po_id == po_id)
        .first()
    )

    if not po:
        raise ValueError("PO not found")

    print("📦 ITEMS FROM DB:", len(po.items or []))
    print("📦 RAW TEXT LENGTH FROM DB:", len(str(po.raw_text or "")))

    xml = build_orders05_xml(db, po)
    po.xml_payload = xml
    db.commit()
    db.refresh(po)

    return po, xml
