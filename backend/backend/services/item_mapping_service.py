def build_runtime_config_from_db(base_header: dict, sap_cfg: dict, item_mapping_cfg: dict) -> dict:
    return {
        "po_number": base_header.get("po_number"),
        "po_date": base_header.get("po_date"),
        "currency": base_header.get("currency") or sap_cfg.get("currency"),
        "po_type": base_header.get("po_type") or sap_cfg.get("po_type"),
        "order_type": base_header.get("order_type") or sap_cfg.get("order_type"),
        "sold_to": base_header.get("sold_to") or sap_cfg.get("sold_to"),
        "ship_to": base_header.get("ship_to") or sap_cfg.get("ship_to"),
        "plant": item_mapping_cfg.get("plant_override") or sap_cfg.get("plant"),
        "uom_default": item_mapping_cfg.get("uom_default"),
        "material_source": item_mapping_cfg.get("material_source", "material"),
    }
