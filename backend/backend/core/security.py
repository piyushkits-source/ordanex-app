from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
from typing import Any

import jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY",
    "ordanex-dev-jwt-secret-key-change-this-for-production-2026",
)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 8 * 60
PASSWORD_RESET_EXPIRE_MINUTES = int(os.getenv("PASSWORD_RESET_EXPIRE_MINUTES", "30"))


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def create_access_token(data: dict[str, Any], expires_minutes: int = JWT_EXPIRE_MINUTES) -> str:
    to_encode = data.copy()
    issued_at = datetime.now(timezone.utc)
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    to_encode.update({"iat": issued_at, "exp": expire})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_password_reset_token(email: str, environment: str, expires_minutes: int = PASSWORD_RESET_EXPIRE_MINUTES) -> str:
    return create_access_token(
        {
            "sub": email,
            "environment": environment,
            "purpose": "password_reset",
        },
        expires_minutes=expires_minutes,
    )


def decode_password_reset_token(token: str) -> dict[str, Any]:
    payload = decode_access_token(token)
    if payload.get("purpose") != "password_reset":
        raise jwt.InvalidTokenError("Invalid password reset token")
    return payload


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
