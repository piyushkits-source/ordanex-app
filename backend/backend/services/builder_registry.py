from __future__ import annotations

from typing import Callable

from backend.services.idoc_builder_service import build_orders05_idoc


class BuilderRegistryError(Exception):
    pass


def build_orders03_idoc(mapped_payload: dict, partner_context: dict) -> dict:
    payload = build_orders05_idoc(mapped_payload, partner_context)
    payload["EDI_DC40"]["IDOCTYP"] = "ORDERS03"
    return payload


def build_generic_rest_payload(mapped_payload: dict, partner_context: dict) -> dict:
    return {
        "meta": {
            "target": partner_context,
        },
        "payload": mapped_payload,
    }


def resolve_output_builder(
    *,
    target_erp: str,
    target_message_standard: str,
    target_message_type: str,
    target_message_version: str | None,
) -> Callable[[dict, dict], dict]:
    erp = (target_erp or "").upper()
    standard = (target_message_standard or "").upper()
    msg_type = (target_message_type or "").upper()
    msg_version = (target_message_version or "").upper()

    if erp == "SAP" and standard == "IDOC" and msg_type in {"ORDERS", "ORDERS05"} and msg_version in {"", "ORDERS05"}:
        return build_orders05_idoc

    if erp == "SAP" and standard == "IDOC" and msg_type in {"ORDERS", "ORDERS03"} and msg_version == "ORDERS03":
        return build_orders03_idoc

    if standard in {"API", "JSON"}:
        return build_generic_rest_payload

    raise BuilderRegistryError(
        f"No builder registered for target_erp={target_erp}, target_message_standard={target_message_standard}, target_message_type={target_message_type}, target_message_version={target_message_version}"
    )
