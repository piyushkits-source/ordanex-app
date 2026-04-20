import hashlib, uuid
from pathlib import Path

UPLOAD_ROOT = Path("data/uploads")

def ensure_upload_dir(client_id: str) -> Path:
    path = UPLOAD_ROOT / client_id
    path.mkdir(parents=True, exist_ok=True)
    return path

def save_uploaded_file(client_id: str, original_file_name: str, file_bytes: bytes) -> dict:
    client_dir = ensure_upload_dir(client_id)
    ext = Path(original_file_name).suffix.lower()
    stored_name = f"{uuid.uuid4()}{ext}"
    full_path = client_dir / stored_name
    with open(full_path, "wb") as f:
        f.write(file_bytes)
    checksum = hashlib.sha256(file_bytes).hexdigest()
    return {"file_path": str(full_path), "file_size_bytes": len(file_bytes), "checksum": checksum}
