from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func, text
from backend.db.database import Base


class PartnerNotification(Base):
    __tablename__ = "partner_notifications"
    notification_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    partner_id = Column(UUID(as_uuid=True), ForeignKey("trading_partners.partner_id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(255), nullable=False)
    notification_type = Column(String(50), nullable=False, default="FAILED")
    include_attachment = Column(Boolean, nullable=False, default=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())
