import React from "react";
import { UomRule } from "../../../types/tradingPartner";

export default function UomRuleModal({ open, value, onChange, onSave, onClose }: { open: boolean; value: UomRule; onChange: (next: UomRule) => void; onSave: () => void; onClose: () => void; }) {
  if (!open) return null;
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={title}>UOM Rule</div>
        <div style={grid}>
          {field("Customer Code", <input value={String(value.customer_code || "")} onChange={(e) => onChange({ ...value, customer_code: e.target.value })} style={input} />)}
          {field("Supplier Code", <input value={String(value.supplier_code || "")} onChange={(e) => onChange({ ...value, supplier_code: e.target.value })} style={input} />)}
          {field("Ship-To Code", <input value={String(value.ship_to_code || "")} onChange={(e) => onChange({ ...value, ship_to_code: e.target.value })} style={input} />)}
          {field("Material Code", <input value={String(value.material_code || "")} onChange={(e) => onChange({ ...value, material_code: e.target.value })} style={input} />)}
          {field("Product Code", <input value={String(value.product_code || "")} onChange={(e) => onChange({ ...value, product_code: e.target.value })} style={input} />)}
          {field("Input UOM", <input value={value.input_uom} onChange={(e) => onChange({ ...value, input_uom: e.target.value })} style={input} />)}
          {field("Output UOM", <input value={value.output_uom} onChange={(e) => onChange({ ...value, output_uom: e.target.value })} style={input} />)}
          {field("Conversion Factor", <input value={String(value.conversion_factor || "")} onChange={(e) => onChange({ ...value, conversion_factor: e.target.value })} style={input} />)}
          {field("Conversion Divider", <input value={String(value.conversion_divider || "")} onChange={(e) => onChange({ ...value, conversion_divider: e.target.value })} style={input} />)}
          {field("Rounding Digits", <input type="number" value={value.rounding_digits} onChange={(e) => onChange({ ...value, rounding_digits: Number(e.target.value || 0) })} style={input} />)}
          {field("Priority", <input type="number" value={value.priority} onChange={(e) => onChange({ ...value, priority: Number(e.target.value || 0) })} style={input} />)}
          {field("Status", <select value={value.is_active ? "ACTIVE" : "INACTIVE"} onChange={(e) => onChange({ ...value, is_active: e.target.value === "ACTIVE" })} style={input}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select>)}
        </div>
        <div style={{ marginTop: 14 }}>
          {field("Notes", <input value={String(value.notes || "")} onChange={(e) => onChange({ ...value, notes: e.target.value })} style={input} />)}
        </div>
        <div style={buttons}>
          <button type="button" style={secondaryButton} onClick={onClose}>Cancel</button>
          <button type="button" style={primaryButton} onClick={onSave}>Save Rule</button>
        </div>
      </div>
    </div>
  );
}
function field(label: string, child: React.ReactNode) { return <div><div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>{label}</div>{child}</div>; }
const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 };
const modal: React.CSSProperties = { width: "min(1000px, 95vw)", maxHeight: "90vh", overflowY: "auto", background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 20px 40px rgba(15,23,42,0.18)" };
const title: React.CSSProperties = { fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 14 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 };
const input: React.CSSProperties = { width: "100%", minHeight: 38, padding: "8px 10px", borderRadius: 8, border: "1px solid #dbe4ee", background: "#fff", fontSize: 13, color: "#0f172a", outline: "none", boxSizing: "border-box" };
const buttons: React.CSSProperties = { display: "flex", gap: 10, marginTop: 14 };
const primaryButton: React.CSSProperties = { border: "1px solid #0b5fff", background: "#0b5fff", color: "#fff", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const secondaryButton: React.CSSProperties = { border: "1px solid #dbe4ee", background: "#fff", color: "#0f172a", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
