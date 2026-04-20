import React from "react";

export type PartnerSectionKey = "MASTER" | "PROFILE" | "CONNECTION" | "UOM" | "MAPPING" | "NOTIFICATION" | "BULK" | "AI";
const sections: { key: PartnerSectionKey; label: string }[] = [
  { key: "MASTER", label: "Partner Master" },
  { key: "PROFILE", label: "Onboarding Profile" },
  { key: "CONNECTION", label: "Connections" },
  { key: "UOM", label: "UOM Rules" },
  { key: "MAPPING", label: "Field Mapping" },
  { key: "NOTIFICATION", label: "Notifications" },
  { key: "BULK", label: "Bulk Onboarding" },
  { key: "AI", label: "AI Onboarding" },
];

export default function PartnerSectionMenu({ activeSection, onSelect }: { activeSection: PartnerSectionKey; onSelect: (section: PartnerSectionKey) => void; }) {
  return (
    <div style={panel}>
      <div style={title}>Sections</div>
      {sections.map((sec) => {
        const active = sec.key === activeSection;
        return <button key={sec.key} type="button" onClick={() => onSelect(sec.key)} style={{ ...item, background: active ? "#eff6ff" : "#fff", color: active ? "#1d4ed8" : "#0f172a", border: active ? "1px solid #bfdbfe" : "1px solid #e5e7eb" }}>{sec.label}</button>;
      })}
    </div>
  );
}
const panel: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 14 };
const title: React.CSSProperties = { fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 14 };
const item: React.CSSProperties = { width: "100%", textAlign: "left", borderRadius: 10, padding: 12, cursor: "pointer", marginBottom: 8 };
