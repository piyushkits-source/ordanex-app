import React from "react";
import { TradingPartner } from "types/tradingPartner";

export default function AuditSection({ partner }: { partner: TradingPartner; onBanner?: (text: string) => void; }) {
  return (
    <div>
      <div style={title}>Audit</div>
      <div style={subTitle}>Audit history for partner <strong>{partner.partner_name}</strong>.</div>
      <div style={placeholder}>Wire this section to your audit log endpoint and show profile, mapping, rules, address master, and connection changes.</div>
    </div>
  );
}

const title: React.CSSProperties = { fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 8 };
const subTitle: React.CSSProperties = { fontSize: 13, color: "#64748b", marginBottom: 14 };
const placeholder: React.CSSProperties = { border: "1px dashed #cbd5e1", borderRadius: 12, padding: 20, color: "#64748b", background: "#f8fafc" };
