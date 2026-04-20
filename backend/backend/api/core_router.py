
from fastapi import APIRouter

# New SaaS/core flow routers
from backend.api.auth_api import router as auth_router
from backend.api.inbound_api import router as inbound_router
from backend.api.purchase_orders_api import router as purchase_orders_router
from backend.api.review_api import router as review_router
from backend.api.document_intelligence_api import router as document_intelligence_router
from backend.api.outbound_api import router as outbound_router


core_router = APIRouter()

core_router.include_router(auth_router)
core_router.include_router(inbound_router)
core_router.include_router(purchase_orders_router)
core_router.include_router(review_router)
core_router.include_router(document_intelligence_router)
core_router.include_router(outbound_router)
