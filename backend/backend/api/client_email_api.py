@router.get("/{client_id}")
def get_email_config(client_id: str, db: Session = Depends(get_db)):
    return db.query(ClientEmailConfig).filter_by(client_id=client_id).first()


@router.post("/")
def save_email_config(payload: EmailConfigCreate, db: Session = Depends(get_db)):
    existing = db.query(ClientEmailConfig).filter_by(client_id=payload.client_id).first()

    if existing:
        for k, v in payload.model_dump().items():
            setattr(existing, k, v)
        db.commit()
        return existing

    config = ClientEmailConfig(**payload.model_dump())
    db.add(config)
    db.commit()
    return config