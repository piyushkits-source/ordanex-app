
from sqlalchemy import text

from backend.db.database import Base, engine, SessionLocal
from backend.db import models

Base.metadata.create_all(bind=engine)


def ensure_notification_schema_extensions() -> None:
    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE partner_notifications ADD COLUMN IF NOT EXISTS approval_recipients TEXT"))
        except Exception:
            # Safe fallback: the app can still run if this patch already exists or the table is not present.
            pass


def ensure_mapping_profile_schema_extensions() -> None:
    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE mapping_profiles ADD COLUMN IF NOT EXISTS partner_id UUID"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE mapping_profiles ALTER COLUMN partner_id TYPE UUID USING NULLIF(partner_id, '')::uuid"))
        except Exception:
            pass
        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_mapping_profiles_partner_id ON mapping_profiles (partner_id)"))
        except Exception:
            # Keep startup resilient if the column or index already exists.
            pass


def ensure_vendor_learning_schema_extensions() -> None:
    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE vendor_layout_learning ADD COLUMN IF NOT EXISTS fingerprint_json JSONB NOT NULL DEFAULT '{}'::jsonb"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE vendor_layout_learning ADD COLUMN IF NOT EXISTS layout_fingerprint_json JSONB NOT NULL DEFAULT '{}'::jsonb"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE vendor_layout_learning ADD COLUMN IF NOT EXISTS mapping_profile_name VARCHAR(255) NOT NULL DEFAULT ''"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE vendor_layout_learning ADD COLUMN IF NOT EXISTS mapping_profile_id VARCHAR(255)"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE vendor_layout_learning ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE vendor_layout_learning ADD COLUMN IF NOT EXISTS confidence NUMERIC(6,3) NOT NULL DEFAULT 0.990"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE vendor_layout_learning ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE vendor_layout_learning ADD COLUMN IF NOT EXISTS approved_count INTEGER NOT NULL DEFAULT 1"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE vendor_layout_learning ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP NULL"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE vendor_layout_learning ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255)"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE vendor_layout_learning ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE"))
        except Exception:
            pass


def ensure_user_schema_extensions() -> None:
    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS environment VARCHAR(20) NOT NULL DEFAULT 'staging'"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key"))
        except Exception:
            pass
        try:
            conn.execute(text("DROP INDEX IF EXISTS users_email_key"))
        except Exception:
            pass
        try:
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email_environment ON users (LOWER(email), environment)"))
        except Exception:
            pass

# Optional startup seed hook. Keep intentionally lightweight.
def run_bootstrap() -> None:
    ensure_notification_schema_extensions()
    ensure_mapping_profile_schema_extensions()
    ensure_vendor_learning_schema_extensions()
    ensure_user_schema_extensions()
    db = SessionLocal()
    try:
        # Touch the DB connection so startup problems fail early.
        db.execute(text("SELECT 1"))
        db.commit()
    finally:
        db.close()


def ensure_runtime_schema_extensions() -> None:
    """Backward-compatible startup hook expected by backend.main."""
    run_bootstrap()

if __name__ == "__main__":
    run_bootstrap()
