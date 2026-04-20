from sqlalchemy.orm import Session
from backend.db.models.message_flow import MessageFlow


def resolve_flow(db: Session, partner_id: str, document_type: str, direction: str):
    flows = (
        db.query(MessageFlow)
        .filter(
            MessageFlow.partner_id == partner_id,
            MessageFlow.document_type == document_type,
            MessageFlow.message_direction == direction,
            MessageFlow.is_active == True,
        )
        .order_by(MessageFlow.priority.asc())
        .all()
    )

    if not flows:
        raise Exception("No active flow found")

    return flows[0]  # first match (priority)


def execute_flow(db: Session, flow: MessageFlow, payload: dict):
    """
    Generic pipeline execution — ERP agnostic
    """

    # 1. PARSER
    if flow.parser_profile_id:
        print("Apply parser profile")

    # 2. VALIDATION
    if flow.validation_profile_id:
        print("Apply validation")

    # 3. BUSINESS RULES
    if flow.rule_profile_id:
        print("Apply business rules")

    # 4. UOM
    if flow.uom_profile_id:
        print("Apply UOM conversions")

    # 5. ADDRESS
    if flow.address_profile_id:
        print("Apply address mapping")

    # 6. MAPPING
    if flow.mapping_profile_id:
        print("Apply mapping")

    # 7. OUTPUT
    if flow.auto_send_on_success:
        print("Send to connection:", flow.target_connection_id)

    return {"status": "processed"}