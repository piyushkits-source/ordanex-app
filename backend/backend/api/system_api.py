from __future__ import annotations

from fastapi import APIRouter

from backend.core.environment import current_environment, is_production, is_staging


router = APIRouter(prefix="/system", tags=["System"])


@router.get("/environment")
def get_environment():
    env = current_environment()
    return {
        "environment": env,
        "is_staging": is_staging(),
        "is_production": is_production(),
        "promotion_mode": "PACKAGE_EXPORT_IMPORT",
    }
