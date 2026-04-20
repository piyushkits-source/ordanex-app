import React from "react";
import { TradingPartner } from "../../types/tradingPartner";

export default function PartnerHeader({ partner }: { partner: TradingPartner }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
        {partner.partner_name}
      </div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
        {partner.partner_code} • {partner.partner_type} • {partner.status}
      </div>
    </div>
  );
}
