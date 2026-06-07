from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from backend.core.environment import current_environment
from backend.db.database import get_db
from backend.db import models
from backend.core.security import hash_password
from backend.services.rbac import require_roles, get_current_user, enforce_client_scope, UserContext

router = APIRouter(prefix="/users", tags=["users"])


def _find_user_by_email_and_environment(db: Session, email: str, environment: str):
    return (
        db.query(models.User)
        .filter(models.User.email == email)
        .filter((models.User.environment == environment) | (models.User.environment.is_(None)))
        .first()
    )

class CreateUserRequest(BaseModel):
    client_id: str | None = None
    environment: str | None = None
    email: EmailStr
    password: str
    role: str
    is_active: bool = True

class ActiveStatusRequest(BaseModel):
    is_active: bool

class ResetPasswordRequest(BaseModel):
    password: str

@router.get("")
def list_users(
    client_id: str | None = None,
    environment: str | None = None,
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_roles("super_admin", "client_admin")),
):
    if current_user.role != "super_admin":
        client_id = current_user.client_id

    env = (environment or current_environment()).strip().lower()
    q = db.query(models.User)
    if client_id:
        q = q.filter(models.User.client_id == client_id)
    q = q.filter((models.User.environment == env) | (models.User.environment.is_(None)))
    rows = q.order_by(models.User.created_at.desc()).all()

    return [
        {
            "user_id": str(u.user_id),
            "email": u.email,
            "client_id": u.client_id,
            "environment": getattr(u, "environment", None),
            "role": u.role,
            "is_active": bool(u.is_active),
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "last_login_at": u.last_login_at.isoformat() if getattr(u, "last_login_at", None) else None,
            "created_by": getattr(u, "created_by", None),
        }
        for u in rows
    ]

@router.post("")
def create_user(
    payload: CreateUserRequest,
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_roles("super_admin", "client_admin")),
):
    if current_user.role != "super_admin":
        enforce_client_scope(current_user, payload.client_id)

    env = (payload.environment or current_environment()).strip().lower()
    existing = (
        db.query(models.User)
        .filter(models.User.email == payload.email)
        .filter((models.User.environment == env) | (models.User.environment.is_(None)))
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")

    user = models.User(
        client_id=payload.client_id,
        environment=env,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=payload.is_active,
        created_by=current_user.email,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"message": "User created successfully", "email": user.email, "user_id": str(user.user_id)}

@router.put("/{email}/active")
def set_user_active(
    email: str,
    payload: ActiveStatusRequest,
    environment: str | None = None,
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_roles("super_admin", "client_admin")),
):
    env = (environment or current_environment()).strip().lower()
    user = _find_user_by_email_and_environment(db, email, env)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if current_user.role != "super_admin":
        enforce_client_scope(current_user, user.client_id)

    user.is_active = payload.is_active
    db.commit()
    return {
        "message": "User status updated",
        "email": email,
        "environment": env,
        "is_active": bool(user.is_active),
    }

@router.put("/{email}/reset-password")
def reset_password(
    email: str,
    payload: ResetPasswordRequest,
    environment: str | None = None,
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_roles("super_admin", "client_admin")),
):
    env = (environment or current_environment()).strip().lower()
    user = _find_user_by_email_and_environment(db, email, env)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if current_user.role != "super_admin":
        enforce_client_scope(current_user, user.client_id)

    user.password_hash = hash_password(payload.password)
    db.commit()
    return {
        "message": "Password reset successfully",
        "email": email,
        "environment": env,
    }

@router.delete("/{email}")
def delete_user(
    email: str,
    environment: str | None = None,
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_roles("super_admin", "client_admin")),
):
    env = (environment or current_environment()).strip().lower()
    user = _find_user_by_email_and_environment(db, email, env)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if current_user.role != "super_admin":
        enforce_client_scope(current_user, user.client_id)

    db.delete(user)
    db.commit()
    return {
        "message": "User deleted successfully",
        "email": email,
        "environment": env,
    }

@router.get("/me")
def me(current_user: UserContext = Depends(get_current_user)):
    return {
        "user_id": current_user.user_id,
        "email": current_user.email,
        "role": current_user.role,
        "client_id": current_user.client_id,
        "environment": current_user.environment,
    }
