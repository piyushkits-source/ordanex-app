import React from "react";
import { TradingPartner } from "../../types/tradingPartner";

export default function PartnerListPanel({ partners, selectedPartnerId, onSelect, loading }: { partners: TradingPartner[]; selectedPartnerId: string; onSelect: (partnerId: string) => void; loading: boolean; }) {
  return (
    <div style={panel}>
      <div style={title}>Partners</div>
      <div style={{ display: "grid", gap: 8 }}>
        {loading ? <div style={emptyText}>Loading partners...</div> : partners.length === 0 ? <div style={emptyText}>No trading partners found.</div> : partners.map((partner) => {
          const active = selectedPartnerId === partner.partner_id;
          return <button key={partner.partner_id} type="button" onClick={() => onSelect(partner.partner_id)} style={{ ...item, border: active ? "1.5px solid #2563eb" : "1px solid #e5e7eb", background: active ? "#eff6ff" : "#fff" }}><div style={{ fontWeight: 700, color: "#0f172a" }}>{partner.partner_name}</div><div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{partner.partner_code} • {partner.partner_type} • {partner.status}</div></button>;
        })}
      </div>
    </div>
  );
}
const panel: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 14 };
const title: React.CSSProperties = { fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 14 };
const item: React.CSSProperties = { width: "100%", textAlign: "left", borderRadius: 10, padding: 12, cursor: "pointer" };
const emptyText: React.CSSProperties = { color: "#64748b", fontSize: 13 };
