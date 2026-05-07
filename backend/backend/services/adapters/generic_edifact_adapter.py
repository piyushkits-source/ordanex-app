from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict

from backend.services.adapters.base_adapter import TargetAdapter


class GenericEdifactAdapter(TargetAdapter):
    adapter_name = "generic_edifact"

    @staticmethod
    def _safe(value: Any) -> str:
        return "" if value is None else str(value).strip()

    @staticmethod
    def _date(value: Any) -> str:
        text = GenericEdifactAdapter._safe(value)
        if len(text) >= 10 and text[4] == "-" and text[7] == "-":
            return text[:10].replace("-", "")
        return text

    @staticmethod
    def _amount(value: Any) -> str:
        text = GenericEdifactAdapter._safe(value).replace(",", "")
        if not text:
            return ""
        try:
            return f"{Decimal(text):.2f}"
        except InvalidOperation:
            return text

    def build(self, canonical: Dict[str, Any], flow=None) -> Dict[str, Any]:
        header = canonical.get("header", {}) or {}
        parties = canonical.get("parties", {}) or {}
        items = canonical.get("items", []) or []

        buyer = parties.get("buyer") or parties.get("sold_to") or {}
        seller = parties.get("seller") or parties.get("supplier") or {}

        invoice_number = self._safe(header.get("invoice_number") or header.get("billing_document_number") or header.get("document_number") or header.get("po_number") or "INV001")
        invoice_date = self._date(header.get("invoice_date") or header.get("document_date") or header.get("po_date") or datetime.utcnow().strftime("%Y-%m-%d"))
        currency = self._safe(header.get("currency_code") or header.get("currency") or "USD")
        reference_po = self._safe(header.get("reference_po_number") or header.get("po_number") or header.get("document_number"))

        segments = [
            "UNB+UNOC:3+ORDANEX+RECEIVER+260506:1200+1'",
            "UNH+1+INVOIC:D:96A:UN'",
            f"BGM+380+{invoice_number}+9'",
        ]
        if invoice_date:
            segments.append(f"DTM+137:{invoice_date}:102'")
        if reference_po:
            segments.append(f"RFF+ON:{reference_po}'")
        if currency:
            segments.append(f"CUX+2:{currency}:9'")
        if buyer.get("partner_name") or buyer.get("partner_code"):
            segments.append(f"NAD+BY+{self._safe(buyer.get('partner_name') or buyer.get('partner_code'))}::9'")
        if seller.get("partner_name") or seller.get("partner_code"):
            segments.append(f"NAD+SU+{self._safe(seller.get('partner_name') or seller.get('partner_code'))}::9'")

        line_count = 0
        total = Decimal("0")
        for idx, item in enumerate(items, start=1):
            item_code = self._safe(item.get("internal_material_code") or item.get("supplier_product_code") or item.get("buyer_product_code") or item.get("material_code"))
            quantity = self._safe(item.get("normalized_quantity") or item.get("ordered_quantity") or item.get("quantity") or "1")
            uom = self._safe(item.get("normalized_uom") or item.get("ordered_uom") or item.get("uom") or "EA")
            amount = self._amount(item.get("amount") or item.get("unit_price"))
            segments.append(f"LIN+{idx}++{item_code}:IN'")
            segments.append(f"QTY+47:{quantity}:{uom}'")
            if amount:
                segments.append(f"PRI+AAA:{amount}'")
            desc = self._safe(item.get("description"))
            if desc:
                segments.append(f"IMD+F++::{desc}'")
            try:
                total += Decimal(amount or "0")
            except Exception:
                pass
            line_count += 1

        segments.extend([
            "UNS+S'",
            f"CNT+2:{line_count}'",
            f"MOA+9:{self._amount(total)}'",
            f"UNT+{len(segments) + 1}+1'",
            "UNZ+1+1'",
        ])

        payload = "".join(segments)
        return {
            "content_type": "application/edifact",
            "file_extension": "edi",
            "payload": payload,
            "meta": {
                "erp": (getattr(flow, "target_erp", None) if flow else None) or "GENERIC",
                "message_type": "INVOICE",
                "message_version": "INVOIC",
                "adapter": self.adapter_name,
            },
        }
