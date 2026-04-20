from __future__ import annotations

from backend.services.adapters.sap_orders03_adapter import SapOrders03Adapter
from backend.services.adapters.sap_orders05_adapter import SapOrders05Adapter
from backend.services.adapters.oracle_order_xml_adapter import OracleOrderXmlAdapter
from backend.services.adapters.d365_sales_order_json_adapter import D365SalesOrderJsonAdapter
from backend.services.adapters.generic_json_adapter import GenericJsonAdapter


def get_target_adapter(*, target_erp: str | None, target_standard: str | None, target_message_type: str | None, target_message_version: str | None):
    erp = (target_erp or "").upper()
    standard = (target_standard or "").upper()
    message_type = (target_message_type or "").upper()
    version = (target_message_version or "").upper()

    if erp == "SAP" and standard == "IDOC" and message_type == "ORDERS" and version == "ORDERS03":
        return SapOrders03Adapter()

    if erp == "SAP" and standard == "IDOC" and message_type == "ORDERS" and version == "ORDERS05":
        return SapOrders05Adapter()

    if erp == "ORACLE" and standard == "XML":
        return OracleOrderXmlAdapter()

    if erp == "D365" and standard in {"JSON", "API"}:
        return D365SalesOrderJsonAdapter()

    return GenericJsonAdapter()