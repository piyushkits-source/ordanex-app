
from backend.core.env_loader import load_backend_env

load_backend_env()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.db.database import Base, engine
from backend.api.auth_api import router as auth_router
from backend.api.clients_api import router as clients_router
from backend.api.client_config_api import router as client_config_router
from backend.api.users_api import router as users_router
from backend.api.purchase_orders_api import router as purchase_orders_router
from backend.api.jobs_api import router as jobs_router
from backend.api.file_upload_api import router as file_upload_router
from backend.api.files_api import router as files_router
from backend.api.xml_api import router as xml_router
from backend.api.email_ops_api import router as email_ops_router
from backend.api.mapping_profiles_api import router as mapping_profiles_router
from backend.api.onboarding_api import router as onboarding_router
from backend.api.document_intelligence_api import router as document_intelligence_router
from backend.api.ai_learning_api import router as ai_learning_router
from backend.api.sla_api import router as sla_router
from backend.api.vendor_learning_api import router as vendor_learning_router
from backend.api.processing_trace_api import router as processing_trace_router
from backend.api.release_api import router as release_router
from backend.api.outbound_api import router as outbound_router
from backend.api.outbound_monitor_api import router as outbound_monitor_router
from backend.api.outbound_queue_api import router as outbound_queue_router
from backend.api.monitoring_api import router as monitoring_router
from backend.api.purchase_orders_actions_api import router as purchase_orders_actions_router
from backend.api.realtime_api import router as realtime_router
from backend.api.partner_onboarding_v2_api import router as partner_onboarding_v2_router
from backend.api.ai_onboarding_assistant_api import router as ai_onboarding_assistant_router
from backend.api.trading_partner_api import router as trading_partner_router
from backend.api.trading_partner_rules_api import router as trading_partner_rules_router
from backend.api.address_master_api import router as address_master_router
from backend.api.execution_api import router as execution_router
from backend.api.message_flow_api import router as message_flow_router
from backend.api.message_canonical_api import router as message_canonical_router
from backend.api.parser_profiles_api import router as parser_profiles_router
from backend.api.replay_api import router as replay_router
from backend.api.monitoring_dashboard_api import router as monitoring_dashboard_router
from backend.api.polling_admin_api import router as polling_admin_router
from backend.api.support_api import router as support_router
from backend.api.trading_partner_agentic_api import router as trading_partner_agentic_router
from backend.api.buyer_portal_api import router as buyer_portal_router
from backend.api.system_api import router as system_router

from fastapi.middleware.cors import CORSMiddleware
from backend.db.database import engine
from backend.db import models_partner_universal_patch
from backend.bootstrap import ensure_runtime_schema_extensions


# from backend.services.parser_registry import parser_registry
# from backend.services.parsers.pdf_parser_adapter import pdf_parser

# parser_registry.register("PDF", pdf_parser)

# New orchestration / SaaS routing
from backend.api.core_router import core_router

app = FastAPI(title="Order Automation API")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


Base.metadata.create_all(bind=engine)
ensure_runtime_schema_extensions()

# Existing routers
app.include_router(auth_router)
app.include_router(clients_router)
app.include_router(client_config_router)
app.include_router(users_router)
app.include_router(purchase_orders_router)
app.include_router(jobs_router)
app.include_router(file_upload_router)
app.include_router(files_router)
app.include_router(xml_router)
app.include_router(email_ops_router)
app.include_router(mapping_profiles_router)
app.include_router(onboarding_router)
app.include_router(document_intelligence_router)
app.include_router(ai_learning_router)
app.include_router(sla_router)
app.include_router(vendor_learning_router)
app.include_router(processing_trace_router)
app.include_router(release_router)
app.include_router(outbound_router)
app.include_router(outbound_monitor_router)
app.include_router(outbound_queue_router)
app.include_router(monitoring_router)
app.include_router(purchase_orders_actions_router)
app.include_router(realtime_router)
app.include_router(partner_onboarding_v2_router)
app.include_router(ai_onboarding_assistant_router)
app.include_router(trading_partner_router)
app.include_router(trading_partner_rules_router)
app.include_router(address_master_router)
app.include_router(execution_router)
app.include_router(message_flow_router)
app.include_router(message_canonical_router)
app.include_router(parser_profiles_router)
app.include_router(replay_router)
app.include_router(monitoring_dashboard_router)
app.include_router(polling_admin_router)
app.include_router(support_router)
app.include_router(trading_partner_agentic_router)
app.include_router(buyer_portal_router)
app.include_router(system_router)


# New SaaS/core routing layer
app.include_router(core_router)

@app.get("/__which_app")
def which_app():
    return {"app": "order_automation_enterprise-main-patched"}

@app.get("/")
def root():
    return {"message": "Order Automation API running"}
