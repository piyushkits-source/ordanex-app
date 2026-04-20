from __future__ import annotations

from backend.db import models


def select_parser_profile(
    db,
    *,
    client_id: str,
    partner_id,
    message_meta: dict,
):
    """
    message_meta example:
    {
        "source_format": "X12",
        "message_type": "850",
        "version": "4010"
    }
    """

    profiles = (
        db.query(models.ParserProfile)
        .filter(
            models.ParserProfile.client_id == client_id,
            models.ParserProfile.partner_id == partner_id,
            models.ParserProfile.is_active == True,  # noqa: E712
        )
        .order_by(models.ParserProfile.priority.asc())
        .all()
    )

    source_format = (message_meta.get("source_format") or "").upper()
    message_type = (message_meta.get("message_type") or "").upper()
    version = (message_meta.get("version") or "").upper()

    for profile in profiles:
        profile_format = (profile.source_format or "").upper()
        profile_type = (profile.source_message_type or "").upper()
        profile_version = (profile.source_version or "").upper()

        format_ok = not profile.source_format or profile_format == source_format
        type_ok = not profile.source_message_type or profile_type == message_type
        version_ok = not profile.source_version or profile_version == version

        if format_ok and type_ok and version_ok:
            return profile

    return None