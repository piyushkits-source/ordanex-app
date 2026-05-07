from __future__ import annotations

from backend.services.adapters.sap_orders03_adapter import SapOrders03Adapter
from backend.services.adapters.sap_orders05_adapter import SapOrders05Adapter
from backend.services.adapters.sap_invoice_idoc_adapter import SapInvoiceIdocAdapter
from backend.services.adapters.oracle_order_xml_adapter import OracleOrderXmlAdapter
from backend.services.adapters.oracle_invoice_xml_adapter import OracleInvoiceXmlAdapter
from backend.services.adapters.generic_xml_adapter import GenericXmlAdapter
from backend.services.adapters.generic_x12_adapter import GenericX12Adapter
from backend.services.adapters.generic_edifact_adapter import GenericEdifactAdapter
from backend.services.adapters.d365_sales_order_json_adapter import D365SalesOrderJsonAdapter
from backend.services.adapters.d365_invoice_json_adapter import D365InvoiceJsonAdapter
from backend.services.adapters.generic_json_adapter import GenericJsonAdapter


INVOICE_MESSAGE_TYPES = {"INVOICE", "AP_INVOICE", "AR_INVOICE"}


def get_target_adapter(*, target_erp: str | None, target_standard: str | None, target_message_type: str | None, target_message_version: str | None):
    erp = (target_erp or "").upper()
    standard = (target_standard or "").upper()
    message_type = (target_message_type or "").upper()
    version = (target_message_version or "").upper()

    if erp == "SAP" and standard == "IDOC" and message_type in INVOICE_MESSAGE_TYPES:
        return SapInvoiceIdocAdapter()

    if standard == "X12" and message_type in INVOICE_MESSAGE_TYPES:
        return GenericX12Adapter()

    if standard == "EDIFACT" and message_type in INVOICE_MESSAGE_TYPES:
        return GenericEdifactAdapter()

    if standard == "XML" and message_type in INVOICE_MESSAGE_TYPES:
        if erp == "ORACLE":
            return OracleInvoiceXmlAdapter()
        return GenericXmlAdapter()

    if erp == "SAP" and standard == "IDOC" and message_type == "ORDERS" and version == "ORDERS03":
        return SapOrders03Adapter()

    if erp == "SAP" and standard == "IDOC" and message_type == "ORDERS" and version == "ORDERS05":
        return SapOrders05Adapter()

    if erp == "ORACLE" and standard == "XML":
        return OracleOrderXmlAdapter()

    if erp == "D365" and standard in {"JSON", "API"} and message_type in INVOICE_MESSAGE_TYPES:
        return D365InvoiceJsonAdapter()

    if erp == "D365" and standard in {"JSON", "API"}:
        return D365SalesOrderJsonAdapter()

    if standard == "XML":
        return GenericXmlAdapter()

    if standard == "X12":
        return GenericX12Adapter()

    if standard == "EDIFACT":
        return GenericEdifactAdapter()

    return GenericJsonAdapter()
