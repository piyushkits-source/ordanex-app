
from __future__ import annotations

from collections.abc import Generator
from dataclasses import dataclass, field

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.db.database import SessionLocal
from backend.db import models


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@dataclass
class UserContext:
    user_id: object
    email: str
    role: str
    client_id: str | None = None
    permissions: list[str] = field(default_factory=list)


def get_current_user_context(db: Session = Depends(get_db)) -> UserContext:
    # Replace this stub with JWT parsing + RBAC lookup.
    user = db.query(models.User).filter(models.User.is_active.is_(True)).order_by(models.User.created_at.asc()).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No active user available. Implement JWT auth and return the authenticated user."
        )
    return UserContext(
        user_id=user.user_id,
        email=user.email,
        role=getattr(user, "role", "BUSINESS_USER"),
        client_id=user.client_id,
        permissions=[],
    )


def require_roles(*allowed_roles: str):
    def _checker(user_ctx: UserContext = Depends(get_current_user_context)) -> UserContext:
        if allowed_roles and user_ctx.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user_ctx.role}' is not allowed for this action.",
            )
        return user_ctx
    return _checker
