# Ordanex — B2B/B2C Supply Chain Document Exchange Platform

## Stack
- **Backend**: FastAPI + SQLAlchemy + Celery + Redis (Python 3.11+)
- **Frontend**: React 18 + TypeScript + Vite
- **Database**: PostgreSQL

---

## Project structure

```
ordanex/
├── backend/                        # FastAPI application root
│   ├── backend/
│   │   ├── main.py                 # FastAPI app, all routers registered
│   │   ├── celery_app.py           # Celery + beat schedule
│   │   ├── worker.py               # Legacy job-queue worker (separate process)
│   │   ├── api/                    # All FastAPI routers
│   │   ├── core/                   # Deps, security, parser/adapter factories
│   │   ├── db/                     # SQLAlchemy models + Pydantic schemas
│   │   ├── parsers/                # Format parsers (PDF, EDI, Excel, CSV, …)
│   │   ├── services/               # Business logic
│   │   │   ├── connectors/         # Email, SFTP, API, File connectors
│   │   │   ├── adapters/           # ERP output adapters (SAP, Oracle, D365, …)
│   │   │   └── parsers/            # Service-layer parsers (X12, EDIFACT, …)
│   │   └── tasks/                  # Celery tasks (email, sftp, processing, outbound)
│   ├── data/
│   │   ├── layout_learning/        # Vendor layout JSON profiles
│   │   └── uploads/                # Runtime file storage (gitignore in prod)
│   ├── .env.example
│   └── README.md
│
└── frontend/                       # React + Vite application
    ├── src/
    │   ├── App.tsx                  # Routes
    │   ├── app/layout/              # TopBar, SideBar, AppLayout
    │   ├── api/                     # Axios API clients
    │   ├── components/
    │   │   ├── auth/                # ProtectedRoute, PublicRoute
    │   │   ├── client_config/       # Client config section components
    │   │   ├── common/              # Shared UI (Toast, Modal, PageHeader, …)
    │   │   ├── document/            # Document viewers (PDF, EDI, Image, …)
    │   │   ├── monitor/             # Message monitor panel components
    │   │   └── trading_partner/     # Trading partner section components
    │   ├── context/                 # AppScopeContext
    │   ├── pages/                   # Route-level page components
    │   ├── types/                   # TypeScript types
    │   └── utils/                   # Auth helpers, API fetch wrappers
    ├── .env.example
    ├── package.json
    └── vite.config.ts
```

---

## Quick start

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env          # fill in DATABASE_URL, CELERY_BROKER_URL, SECRET_KEY

# Run DB migrations / table creation
uvicorn backend.main:app --reload --port 8000

# In a separate terminal — Celery worker
celery -A backend.celery_app worker --loglevel=info

# In a separate terminal — Celery beat scheduler (email + SFTP polling)
celery -A backend.celery_app beat --loglevel=info
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env          # set VITE_API_BASE=http://localhost:8000
npm run dev                   # http://localhost:5173
```

---

## Roles

| Role         | Access                                                          |
|--------------|-----------------------------------------------------------------|
| Super Admin  | Full platform access                                            |
| Client Admin | Trading partner management + user management for their client   |
| IT Admin     | View/update partner business rules, UOM tables, fix messages    |
| Business User| Message monitoring + agent-assisted support                     |

---

## Key features

- **Message monitoring** — visual intelligence, document AI, OCR fallback, bounding-box drag-and-drop corrections
- **Client configuration** — ERP-agnostic, format-agnostic (PDF, Word, Image, Excel, X12, EDIFACT), connection types (Email, AS2, SFTP, API)
- **Trading partner onboarding** — single/bulk (100+ partners), AI zero-touch onboarding, agentic runtime support
- **Processing trace** — full stage-by-stage audit log per message
- **Activity log** — all field changes with user ID + timestamp
- **Polling** — email (every 2 min) and SFTP (every 5 min) via Celery beat; manual trigger via `/polling-admin/run/*`

---

## Bug fixes applied in this release

| # | File | Fix |
|---|------|-----|
| 1 | `backend/main.py` | Registered missing `polling_admin_router` |
| 2 | `celery_app.py` | Beat schedule task names aligned with decorators |
| 3 | `email_polling_service.py` | Switched `'ALL'` → `'UNSEEN'`; proper error logging |
| 4 | `connectors/email_connector.py` | Fixed broken import path for `BaseConnector` |
| 5 | `api/execution_api.py` | Updated to use `execution_pipeline_v2` |
| 6 | 76 Python files | Fixed Windows CRLF → LF line endings |
| 7 | `SideBar.tsx` | Added Trading Partners nav item |
| 8 | `TopBar.tsx` | Fixed missing page titles for `/trading-partners` and `/users` |
| 9 | `App.tsx` | Added `/trading-partners` list route (was unreachable) |
| 10 | `TradingPartnerPage.tsx` | Removed hardcoded `localhost:8000` URL |
| 11 | 7 TypeScript files | Fixed Windows CRLF → LF line endings |

## Files removed

### Backend
`ai_parser.py`, `sap_client.py`, `som_to_idoc.py`, `parser_excel.py` (root-level, never imported),
`api/trading_partner_api_old.py`, `api/router.py`, `api/config_api_enterprise.py`,
`api/universal_processing_api.py` (commented out in main), `connectors/sftp_connector1.py`,
`services/document_processor.py` (v1 superseded), `services/partner_intelligence.py` (v1 superseded),
all `__pycache__/`, `.pyc`, `celerybeat-schedule`

### Frontend
`App_old.tsx`, `AppLayout_old.tsx`, `SideBar_old.tsx`, `TopBar_old.tsx`, `ExpandedView_old.tsx`,
`UserMenu_old.tsx`, `MessageDetailsPanel_old.tsx`, `MessageDetailsPanel_old1.tsx`,
`TradingPartnerSectionMenu_old.tsx`, `MessageMonitorPage_old.tsx`,
`components/viewer/` (entire directory, superseded by `components/document/`),
`pages/MessageMonitor.tsx`, `pages/PremiumMessageMonitorPage.tsx`, `pages/PartnerOnboardingPage.tsx`,
`pages/AiOnboardingPage.tsx`, `pages/UniversalProcessingPage.tsx`, `pages/PoViewerPage.tsx`,
`src/message-monitor-premium.css` (duplicate), `node_modules/`
