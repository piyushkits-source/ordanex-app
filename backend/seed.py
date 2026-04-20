import uuid
from backend.db.database import SessionLocal
from backend.db import models
from backend.core.security import hash_password

db = SessionLocal()

def cols(model):
    return {c.name for c in model.__table__.columns}

print("Tenant columns:", sorted(cols(models.Tenant)))
print("Client columns:", sorted(cols(models.Client)))
print()

# ---- 1. Tenant ----
tenant = db.query(models.Tenant).first()
if not tenant:
    tenant = models.Tenant(
        tenant_id=uuid.uuid4(),
        tenant_name="Ordanex Demo Tenant",
        status="ACTIVE",
    )
    db.add(tenant)
    db.commit()
    print(f"[+] Tenant created: {tenant.tenant_id}")
else:
    print(f"[=] Tenant exists: {tenant.tenant_id}")

# ---- 2. Client ----
client = db.query(models.Client).filter_by(client_id="DEMO").first()
if not client:
    client = models.Client(
        client_id="DEMO",
        tenant_id=tenant.tenant_id,
        client_name="Demo Client Inc.",
        status="ACTIVE",
        subscription_type="ENTERPRISE",
        default_currency="USD",
    )
    db.add(client)
    db.commit()
    print(f"[+] Client created: DEMO")
else:
    print(f"[=] Client exists: DEMO")

# ---- 3. Admin user ----
admin = db.query(models.User).filter_by(email="admin@ordanex.com").first()
if not admin:
    admin = models.User(
        email="admin@ordanex.com",
        password_hash=hash_password("Admin@123"),
        role="SUPER_ADMIN",
        client_id="DEMO",
        tenant_id=tenant.tenant_id,
        is_active=True,
        display_name="Ordanex Admin",
    )
    db.add(admin)
    db.commit()
    print(f"[+] Admin user created")
else:
    admin.client_id = "DEMO"
    admin.tenant_id = tenant.tenant_id
    admin.is_active = True
    admin.password_hash = hash_password("Admin@123")
    db.commit()
    print(f"[=] Admin user updated")

print()
print("-" * 50)
print("Login credentials:")
print("  URL:      http://localhost:5174/")
print("  Email:    admin@ordanex.com")
print("  Password: Admin@123")
print("-" * 50)

db.close()
