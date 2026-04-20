
from backend.db.database import Base, engine, SessionLocal
from backend.db import models

Base.metadata.create_all(bind=engine)

# Optional startup seed hook. Keep intentionally lightweight.
def run_bootstrap() -> None:
    db = SessionLocal()
    try:
        # Touch the DB connection so startup problems fail early.
        db.execute("SELECT 1")
        db.commit()
    finally:
        db.close()

if __name__ == "__main__":
    run_bootstrap()
