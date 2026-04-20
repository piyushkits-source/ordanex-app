
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID

# Add this model to backend/db/models.py

class ClientConfigVersion(Base):
    __tablename__ = "client_config_versions"

    config_version_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    client_id = Column(String(100), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False, index=True)
    config_type = Column(String(50), nullable=False, index=True)
    config_key = Column(String(100), nullable=False, default="default")
    version_no = Column(Integer, nullable=False)
    config_value_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    validation_status = Column(String(30), nullable=False, default="VALID")
    validation_errors = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    change_summary = Column(Text)
    is_active = Column(Boolean, nullable=False, default=False, index=True)
    created_by = Column(String(255))
    created_at = Column(DateTime, nullable=False, server_default=func.now())
