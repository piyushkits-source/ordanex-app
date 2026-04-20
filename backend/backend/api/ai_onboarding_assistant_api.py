from fastapi import APIRouter, Depends
from backend.services.rbac import get_current_user
router = APIRouter(prefix="/ai-onboarding-assistant", tags=["AI Onboarding Assistant"])

def _build_config(state, user):
    return {
        "client_id": user.client_id,
        "partner_hint": state.get("partner_name"),
        "profile": {
            "duplicate_check_enabled": state.get("duplicate_check", True),
            "po_date_source": "PO_DATE" if state.get("po_date_source", "PO") == "PO" else "RECEIVED_DATE",
            "split_rule": state.get("split_rule", "NONE"),
        },
        "rules": [],
        "mappings": [],
    }

@router.post('/chat')
def ai_onboarding_chat(payload: dict, current_user=Depends(get_current_user)):
    message = str(payload.get('message') or '').strip()
    state = payload.get('state', {}) or {}
    step = state.get('step', 'start')
    if step == 'start':
        return {"reply": "👋 I’ll help you onboard a trading partner. What is the partner name?", "state": {"step": "partner_name"}}
    if step == 'partner_name':
        state['partner_name'] = message
        return {"reply": "What format will this partner mostly send? (PDF / Excel / CSV / EDI / JSON / XML)", "state": {**state, "step": "format"}}
    if step == 'format':
        state['format'] = message.upper()
        return {"reply": "Should duplicate PO check be enabled? (Yes / No)", "state": {**state, "step": "duplicate"}}
    if step == 'duplicate':
        state['duplicate_check'] = message.lower() == 'yes'
        return {"reply": "How should orders be split? (None / Line Item / Delivery Date / Quantity Load / Delivery Location)", "state": {**state, "step": "split"}}
    if step == 'split':
        state['split_rule'] = message.upper().replace(' ', '_')
        return {"reply": "What should be the PO date source? (PO / Received Date)", "state": {**state, "step": "po_date"}}
    if step == 'po_date':
        state['po_date_source'] = 'RECEIVED' if 'RECEIVED' in message.upper() else 'PO'
        preview = _build_config(state, current_user)
        return {"reply": "✅ I prepared a draft onboarding configuration. Please review and confirm in the UI.", "state": {**state, "step": "review"}, "preview": preview}
    return {"reply": "Let’s restart the onboarding assistant.", "state": {"step": "start"}}
