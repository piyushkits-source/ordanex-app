import React, { useEffect, useState } from "react";
import { apiFetch, parseApiError } from "utils/api";
import { TradingPartner } from "types/tradingPartner";
import { TradingPartnerBusinessRule } from "types/tradingPartnerRules";

const API_BASE = "/trading-partners";

const emptyRule = (partner: TradingPartner): TradingPartnerBusinessRule => ({
  client_id: partner.client_id,
  partner_id: partner.partner_id,
  rule_name: "",
  rule_type: "TRANSFORMATION",
  document_type: "PO",
  message_direction: "INBOUND",
  sold_to: "",
  ship_to: "",
  material_code: "",
  condition_json: { field: "po_number", operator: "contains", value: "" },
  action_json: { action: "FLAG_REVIEW" },
  priority: 100,
  stop_on_match: false,
  is_active: true,
  notes: "",
});

export default function BusinessRulesSection({
  partner,
  onBanner,
}: {
  partner: TradingPartner;
  onBanner: (text: string) => void;
}) {
  const [rows, setRows] = useState<TradingPartnerBusinessRule[]>([]);
  const [form, setForm] = useState<TradingPartnerBusinessRule>(emptyRule(partner));

  useEffect(() => {
    setForm(emptyRule(partner));
    loadRows();
  }, [partner.partner_id]);

  async function loadRows() {
    try {
      const res = await apiFetch(`${API_BASE}/${partner.partner_id}/business-rules`, { method: "GET" });
      if (!res.ok) throw new Error(await parseApiError(res));
      setRows(await res.json());
    } catch (err: any) {
      onBanner(err?.message || "Failed to load business rules.");
    }
  }

  async function saveRow() {
    try {
      const res = await apiFetch(`${API_BASE}/${partner.partner_id}/business-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      onBanner("Business rule created successfully.");
      setForm(emptyRule(partner));
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to save business rule.");
    }
  }

  return (
    <div>
      <div style={title}>Business Rules Engine</div>
      <div style={help}>Configure validation, transformation, routing, and enrichment rules without changing backend code.</div>

      <div style={grid}>
        {field("Rule Name", <input style={input} value={form.rule_name} onChange={(e) => setForm({ ...form, rule_name: e.target.value })} />)}
        {field("Rule Type", <select style={input} value={form.rule_type} onChange={(e) => setForm({ ...form, rule_type: e.target.value })}>
          <option value="VALIDATION">VALIDATION</option>
          <option value="TRANSFORMATION">TRANSFORMATION</option>
          <option value="ROUTING">ROUTING</option>
          <option value="ENRICHMENT">ENRICHMENT</option>
        </select>)}
        {field("Priority", <input type="number" style={input} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value || 0) })} />)}
        {field("Condition Field", <input style={input} value={form.condition_json.field || ""} onChange={(e) => setForm({ ...form, condition_json: { ...form.condition_json, field: e.target.value } })} />)}
        {field("Operator", <select style={input} value={form.condition_json.operator || "eq"} onChange={(e) => setForm({ ...form, condition_json: { ...form.condition_json, operator: e.target.value } })}>
          <option value="eq">eq</option>
          <option value="neq">neq</option>
          <option value="contains">contains</option>
          <option value="in">in</option>
          <option value="gt">gt</option>
          <option value="gte">gte</option>
          <option value="lt">lt</option>
          <option value="lte">lte</option>
        </select>)}
        {field("Condition Value", <input style={input} value={form.condition_json.value || ""} onChange={(e) => setForm({ ...form, condition_json: { ...form.condition_json, value: e.target.value } })} />)}
        {field("Action", <select style={input} value={form.action_json.action || "FLAG_REVIEW"} onChange={(e) => setForm({ ...form, action_json: { ...form.action_json, action: e.target.value } })}>
          <option value="FLAG_REVIEW">FLAG_REVIEW</option>
          <option value="REJECT">REJECT</option>
          <option value="SET_FIELD">SET_FIELD</option>
          <option value="ROUTE_TO_CONNECTION">ROUTE_TO_CONNECTION</option>
          <option value="SET_DELIVERY_OFFSET">SET_DELIVERY_OFFSET</option>
        </select>)}
      </div>

      <div style={row}>
        <button type="button" style={button} onClick={saveRow}>Add Business Rule</button>
      </div>

      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Rule</th>
            <th style={th}>Type</th>
            <th style={th}>Condition</th>
            <th style={th}>Action</th>
            <th style={th}>Priority</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} style={td}>No business rules configured.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.rule_id}>
              <td style={td}>{r.rule_name}</td>
              <td style={td}>{r.rule_type}</td>
              <td style={td}>{JSON.stringify(r.condition_json)}</td>
              <td style={td}>{JSON.stringify(r.action_json)}</td>
              <td style={td}>{r.priority}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function field(label: string, child: React.ReactNode) {
  return <div><div style={labelStyle}>{label}</div>{child}</div>;
}

const title: React.CSSProperties = { fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 8 };
const help: React.CSSProperties = { fontSize: 12, color: "#64748b", marginBottom: 14 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 };
const row: React.CSSProperties = { display: "flex", gap: 10, marginTop: 14, marginBottom: 12 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 };
const input: React.CSSProperties = { width: "100%", minHeight: 38, padding: "8px 10px", borderRadius: 8, border: "1px solid #dbe4ee" };
const button: React.CSSProperties = { border: "1px solid #0b5fff", background: "#0b5fff", color: "#fff", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700 };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", marginTop: 8 };
const th: React.CSSProperties = { textAlign: "left", padding: "10px 12px", background: "#f8fafc", borderBottom: "1px solid #e5e7eb" };
const td: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #eef2f7", fontSize: 13 };
