import hashlib

def generate_layout_fingerprint(mappings_json: list[dict]) -> str:
    simplified = []

    for m in mappings_json or []:
        bbox = m.get("bbox")
        if not bbox:
            continue

        simplified.append(
            (
                round(bbox.get("x", 0), 2),
                round(bbox.get("y", 0), 2),
                round(bbox.get("width", 0), 2),
                round(bbox.get("height", 0), 2),
            )
        )

    simplified.sort()
    raw = str(simplified).encode()
    return hashlib.md5(raw).hexdigest()