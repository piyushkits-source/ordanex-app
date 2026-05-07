from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from backend.db import models, schemas
from backend.core.environment import current_environment

SECRET_KEY = "change-this-in-env"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
        ) from exc


class AuthService:
    def login(self, db: Session, payload: schemas.LoginRequest) -> schemas.LoginResponse:
        env = current_environment()
        user = (
            db.query(models.User)
            .filter(models.User.email == payload.email)
            .filter((models.User.environment == env) | (models.User.environment.is_(None)))
            .first()
        )
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials.",
            )

        # Replace with real password hash verification
        if payload.password != "admin":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials.",
            )

        token = create_access_token(
            {
                "sub": user.email,
                "email": user.email,
                "role": user.role,
                "client_id": user.client_id,
                "environment": (user.environment or env).lower(),
            }
        )

        return schemas.LoginResponse(
            access_token=token,
            token_type="bearer",
            user_id=user.user_id,
            email=user.email,
            role=user.role,
            client_id=user.client_id,
            environment=(user.environment or env).lower(),
        )


auth_service = AuthService()