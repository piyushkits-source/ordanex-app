from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.core.environment import current_environment
from backend.core.security import create_access_token, verify_password
from backend.db.database import get_db
from backend.db import models, schemas
from backend.services.rbac import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=schemas.LoginResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
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
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive",
        )

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    client = (
        db.query(models.Client)
        .filter(models.Client.client_id == user.client_id)
        .first()
        if user.client_id
        else None
    )
    subscription_type = getattr(client, "subscription_type", None) if client else None

    access_token = create_access_token(
        {
            "sub": user.email,
            "role": user.role,
            "client_id": user.client_id,
            "user_id": str(user.user_id),
            "environment": env,
            "subscription_type": subscription_type,
        }
    )

    return schemas.LoginResponse(
        access_token=access_token,
        user_id=user.user_id,
        email=user.email,
        role=user.role,
        client_id=user.client_id,
        environment=env,
        subscription_type=subscription_type,
    )


@router.get("/me")
def me(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    client = (
        db.query(models.Client)
        .filter(models.Client.client_id == current_user.client_id)
        .first()
        if current_user.client_id
        else None
    )
    return {
        "user_id": current_user.user_id,
        "email": current_user.email,
        "role": current_user.role,
        "client_id": current_user.client_id,
        "environment": current_user.environment,
        "subscription_type": getattr(client, "subscription_type", None) if client else None,
    }
