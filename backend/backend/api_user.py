from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.db.database import get_db
from backend.models_user import User
from backend.schemas_user import UserCreate, UserRead
from backend.auth_utils import hash_password

router = APIRouter(prefix="/users", tags=["Users"])

@router.post("", response_model=UserRead)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        client_id=payload.client_id
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.get("", response_model=list[UserRead])
def get_users(db: Session = Depends(get_db)):
    return db.query(User).all()
