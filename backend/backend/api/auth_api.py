from __future__ import annotations

import os
from datetime import datetime, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.core.environment import current_environment
from backend.core.security import (
    create_access_token,
    create_password_reset_token,
    decode_password_reset_token,
    hash_password,
    verify_password,
)
from backend.db.database import get_db
from backend.db import models, schemas
from backend.services.email_service import send_application_email
from backend.services.rbac import get_current_user
from backend.services.entitlement_service import get_client_entitlements

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _find_user_by_email(db: Session, email: str, env: str):
    return (
        db.query(models.User)
        .filter(models.User.email == email)
        .filter((models.User.environment == env) | (models.User.environment.is_(None)))
        .first()
    )


def _reset_password_base_url() -> str:
    return (
        os.getenv("FRONTEND_BASE_URL")
        or os.getenv("APP_BASE_URL")
        or "https://app.ordanex.ai"
    ).rstrip("/")


@router.post("/login", response_model=schemas.LoginResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    env = current_environment()
    user = _find_user_by_email(db, payload.email, env)

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
    entitlements = get_client_entitlements(db, user.client_id) if user.client_id else {"buyer_storefront": False, "buyer_storefront_disabled": False}
    feature_flags = [
        "buyer_storefront",
    ] if entitlements.get("buyer_storefront") else []
    disabled_feature_flags = [
        "buyer_storefront",
    ] if entitlements.get("buyer_storefront_disabled") else []

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
        feature_flags=feature_flags,
        disabled_feature_flags=disabled_feature_flags,
    )


@router.post("/forgot-password", response_model=schemas.MessageResponse)
def forgot_password(payload: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    env = current_environment()
    user = _find_user_by_email(db, payload.email, env)

    if user and user.is_active:
        reset_token = create_password_reset_token(user.email, env)
        reset_link = f"{_reset_password_base_url()}/reset-password?token={reset_token}"
        subject = "Reset your Ordanex password"
        body_html = f"""
        <p>Hello,</p>
        <p>We received a request to reset your Ordanex password.</p>
        <p>
          <a href="{reset_link}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2563eb;color:#ffffff;text-decoration:none;">
            Reset password
          </a>
        </p>
        <p>If you did not request this, you can safely ignore this email.</p>
        <p>This link expires in 30 minutes.</p>
        """
        ok, message = send_application_email([user.email], subject, body_html)
        if not ok:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Unable to send reset email: {message}",
            )

    return schemas.MessageResponse(
        message="If an account exists for this email, a password reset link has been sent."
    )


@router.post("/reset-password", response_model=schemas.MessageResponse)
def reset_password(payload: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    try:
        reset_claims = decode_password_reset_token(payload.token)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link",
        )

    email = str(reset_claims.get("sub") or "").strip()
    env = str(reset_claims.get("environment") or current_environment()).strip()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link",
        )

    user = _find_user_by_email(db, email, env)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User account is unavailable for password reset",
        )

    user.password_hash = hash_password(payload.new_password)
    user.failed_login_count = 0
    user.is_locked = False
    user.updated_at = datetime.now(timezone.utc)
    db.add(user)
    db.commit()

    return schemas.MessageResponse(
        message="Password updated successfully. You can sign in now."
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
    entitlements = get_client_entitlements(db, current_user.client_id) if current_user.client_id else {"buyer_storefront": False, "buyer_storefront_disabled": False}
    return {
        "user_id": current_user.user_id,
        "email": current_user.email,
        "role": current_user.role,
        "client_id": current_user.client_id,
        "environment": current_user.environment,
        "subscription_type": getattr(client, "subscription_type", None) if client else None,
        "feature_flags": ["buyer_storefront"] if entitlements.get("buyer_storefront") else [],
        "disabled_feature_flags": ["buyer_storefront"] if entitlements.get("buyer_storefront_disabled") else [],
        "disabled_feature_flags": ["buyer_storefront"] if entitlements.get("buyer_storefront_disabled") else [],
    }
