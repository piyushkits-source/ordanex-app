import os

from backend.core.env_loader import load_backend_env

load_backend_env()

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

LOCAL_DATABASE_URL = "postgresql://app_user:Jaishriram143@localhost:5432/order_automation"


def _resolve_database_url() -> str:
    database_url = (os.getenv("DATABASE_URL") or "").strip()
    if database_url:
        return database_url

    environment = (os.getenv("ENVIRONMENT") or os.getenv("APP_ENV") or "").strip().lower()
    if environment in {"prod", "production", "staging"}:
        raise RuntimeError("DATABASE_URL is not set for a non-local environment.")

    return LOCAL_DATABASE_URL


DATABASE_URL = _resolve_database_url()

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
