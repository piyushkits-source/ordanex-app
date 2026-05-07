from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict

from backend.services.adapters.base_adapter import TargetAdapter


class GenericX12Adapter(TargetAdapter):
    adapter_name = "generic_x12"

    @staticmethod
    def _safe(value: Any) -> str:
        return "" if value is None else str(value).strip()

    @staticmethod
    def _date(value: Any) -> str:
        text = GenericX12Adapter._safe(value)
        if len(text) >= 10 and text[4] == "-" and text[7] == "-":
            return text[:10].replace("-", "")
        return text

    @staticmethod
    def _amount(value: Any) -> str:
        text = GenericX12Adapter._safe(value).replace(",", "")
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
            "ISA*00*          *00*          *ZZ*ORDANEX         *ZZ*RECEIVER        *260506*1200*U*00401*000000001*0*P*>~",
            "GS*IN*ORDANEX*RECEIVER*20260506*1200*1*X*004010~",
            "ST*810*0001~",
            f"BIG*{invoice_date}*{invoice_number}**{reference_po}~",
            f"CUR*BY*{currency}~",
        ]
        if buyer.get("partner_name") or buyer.get("partner_code"):
            segments.append(f"N1*BY*{self._safe(buyer.get('partner_name') or buyer.get('partner_code'))}~")
        if seller.get("partner_name") or seller.get("partner_code"):
            segments.append(f"N1*SU*{self._safe(seller.get('partner_name') or seller.get('partner_code'))}~")

        line_count = 0
        total = Decimal("0")
        for idx, item in enumerate(items, start=1):
            quantity = self._safe(item.get("normalized_quantity") or item.get("ordered_quantity") or item.get("quantity") or "1")
            uom = self._safe(item.get("normalized_uom") or item.get("ordered_uom") or item.get("uom") or "EA")
            unit_price = self._amount(item.get("unit_price"))
            item_code = self._safe(item.get("internal_material_code") or item.get("supplier_product_code") or item.get("buyer_product_code") or item.get("material_code"))
            desc = self._safe(item.get("description"))
            segments.append(f"IT1*{idx}*{quantity}*{uom}*{unit_price}**BP*{item_code}~")
            if desc:
                segments.append(f"PID*F****{desc}~")
            try:
                total += Decimal(self._amount(item.get("amount") or item.get("unit_price") or "0"))
            except Exception:
                pass
            line_count += 1

        segments.extend([
            f"TDS*{int((total * Decimal('100')).quantize(Decimal('1')))}~",
            f"CTT*{line_count}~",
            "SE*1*0001~",
            "GE*1*1~",
            "IEA*1*000000001~",
        ])

        payload = "".join(segments)
        return {
            "content_type": "application/x-x12",
            "file_extension": "x12",
            "payload": payload,
            "meta": {
                "erp": (getattr(flow, "target_erp", None) if flow else None) or "GENERIC",
                "message_type": "INVOICE",
                "message_version": "810",
                "adapter": self.adapter_name,
            },
        }
