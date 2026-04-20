from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session


from backend.services.mapping_generation_service import generate_mapping_from_parsed_doc
from backend.services.client_config_service import get_client_sap_config


def build_lightweight_onboarding_result(
    db: Session,
    parsed_docs: list[dict],
    *,
    client_id: str,
    sold_to: str | None = None,
    ship_to: str | None = None,
    similarity_threshold: float = 0.72,
) -> dict[str, Any]:
    clusters = cluster_documents(parsed_docs, threshold=similarity_threshold)

    sap_cfg = get_client_sap_config(db, client_id)

    generated_profiles = []
    for cluster in clusters:
        rep_doc_id = cluster["representative_doc_id"]
        representative = None

        for idx, parsed in enumerate(parsed_docs, start=1):
            if f"D{idx}" == rep_doc_id:
                representative = parsed
                break

        if not representative:
            continue

        vendor = (representative.get("header", {}) or {}).get("supplier") or "vendor"
        profile_name = f"{client_id}_{vendor}_{cluster['cluster_id']}".replace(" ", "_")

        generated_profiles.append(
            {
                "cluster_id": cluster["cluster_id"],
                "document_count": cluster["document_count"],
                "profile_payload": generate_mapping_from_parsed_doc(
                    representative,
                    profile_name=profile_name,
                    client_id=client_id,
                    sold_to=sold_to,
                    ship_to=ship_to,
                    sender=sap_cfg["sender"],
                    receiver=sap_cfg["receiver"],
                    idoctyp=sap_cfg["idoctyp"],
                    mestyp=sap_cfg["mestyp"],
                    po_type=sap_cfg["po_type"],
                    order_type=sap_cfg["order_type"],
                ),
            }
        )

    return {
        "client_id": client_id,
        "sap_defaults": sap_cfg,
        "cluster_count": len(clusters),
        "clusters": clusters,
        "generated_profiles": generated_profiles,
    }