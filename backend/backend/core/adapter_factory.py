from __future__ import annotations

from backend.services.adapter_registry import get_target_adapter


def get_adapter(
    *,
    target_erp: str | None = None,
    target_standard: str | None = None,
    target_message_type: str | None = None,
    target_message_version: str | None = None,
):
    return get_target_adapter(
        target_erp=target_erp,
        target_standard=target_standard,
        target_message_type=target_message_type,
        target_message_version=target_message_version,
    )