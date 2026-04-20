# Order Automation Platform

This pack is a strong production-style baseline for your app.

## Run order

```bash
python -m backend.bootstrap
python -m uvicorn backend.main:app --reload
python -m backend.worker
streamlit run frontend/app.py
```

## First login
- Email: admin@test.com
- Password: admin123

## Important
Replace these with your current working business logic if you already have better versions:
- `ai_parser.py`
- `som_to_idoc.py`
- `sap_client.py`
