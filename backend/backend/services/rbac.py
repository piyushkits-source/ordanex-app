from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from backend.core.environment import current_environment
from backend.core.security import decode_access_token
from backend.db.database import get_db
from backend.db import models


@dataclass
class UserContext:
    user_id: str
    email: str
    role: str
    client_id: str | None
    environment: str


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
        )

    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
        )

    return parts[1].strip()


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> UserContext:
    token = _extract_bearer_token(authorization)

    try:
        payload = decode_access_token(token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    email = payload.get("sub")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    token_env = (payload.get("environment") or current_environment()).strip().lower()
    env = current_environment()
    if token_env != env:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token environment mismatch",
        )

    user = (
        db.query(models.User)
        .filter(models.User.email == email)
        .filter((models.User.environment == env) | (models.User.environment.is_(None)))
        .first()
    )
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return UserContext(
        user_id=str(user.user_id),
        email=user.email,
        role=user.role,
        client_id=user.client_id,
        environment=(user.environment or env),
    )


def require_roles(*allowed_roles: str):
    def dependency(current_user: UserContext = Depends(get_current_user)) -> UserContext:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return dependency


def enforce_client_scope(current_user: UserContext, client_id: str | None):
    if current_user.role == "super_admin":
        return

    if not client_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Client scope is required",
        )

    if current_user.client_id != client_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized for this client",
        )
