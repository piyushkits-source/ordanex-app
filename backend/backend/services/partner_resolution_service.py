import hashlib

class PartnerResolutionService:

    def normalize(self, text: str) -> str:
        return " ".join(text.lower().split())

    def generate_hash(self, name: str, address: str) -> str:
        base = f"{self.normalize(name)}|{self.normalize(address)}"
        return hashlib.md5(base.encode()).hexdigest()

    def resolve_partner(self, db, client_id, partner_type, name, address):
        normalized = self.generate_hash(name, address)

        record = db.query(models.BusinessPartnerAddress).filter(
            models.BusinessPartnerAddress.client_id == client_id,
            models.BusinessPartnerAddress.partner_type == partner_type,
            models.BusinessPartnerAddress.normalized_hash == normalized
        ).first()

        if record:
            return {
                "code": record.partner_code,
                "name": record.partner_name,
                "matched": True
            }

        return {
            "code": None,
            "name": name,
            "matched": False
        }

partner_resolution_service = PartnerResolutionService()