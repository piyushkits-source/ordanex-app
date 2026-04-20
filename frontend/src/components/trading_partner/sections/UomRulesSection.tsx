import React, { useEffect, useState } from "react";
import { apiFetch, parseApiError } from "utils/api";
import { TradingPartner } from "types/tradingPartner";
import { TradingPartnerUomRule } from "types/tradingPartnerRules";

const API_BASE = "/trading-partners";

const emptyRule = (partner: TradingPartner): TradingPartnerUomRule => ({
  client_id: partner.client_id,
  partner_id: partner.partner_id,
  sold_to: "",
  ship_to: "",
  material_code: "",
  product_code: "",
  input_uom: "EA",
  output_uom: "EA",
  conversion_factor: 1,
  conversion_divider: 1,
  rounding_digits: 2,
  rounding_mode: "HALF_UP",
  min_quantity: "",
  max_quantity: "",
  priority: 100,
  is_active: true,
  notes: "",
});

export default function UomRulesSection({
  partner,
  onBanner,
}: {
  partner: TradingPartner;
  onBanner: (text: string) => void;
}) {
  const [rows, setRows] = useState<TradingPartnerUomRule[]>([]);
  const [form, setForm] = useState<TradingPartnerUomRule>(emptyRule(partner));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setForm(emptyRule(partner));
    loadRows();
  }, [partner.partner_id]);

  async function loadRows() {
    try {
      setLoading(true);
      const res = await apiFetch(`${API_BASE}/${partner.partner_id}/uom-rules`, { method: "GET" });
      if (!res.ok) throw new Error(await parseApiError(res));
      setRows(await res.json());
    } catch (err: any) {
      onBanner(err?.message || "Failed to load UOM rules.");
    } finally {
      setLoading(false);
    }
  }

  async function saveRow() {
    try {
      const payload = {
        ...form,
        client_id: partner.client_id,
        partner_id: partner.partner_id,
        conversion_factor: form.conversion_factor === "" ? null : Number(form.conversion_factor),
        conversion_divider: form.conversion_divider === "" ? null : Number(form.conversion_divider),
        min_quantity: form.min_quantity === "" ? null : Number(form.min_quantity),
        max_quantity: form.max_quantity === "" ? null : Number(form.max_quantity),
      };

      const res = await apiFetch(`${API_BASE}/${partner.partner_id}/uom-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      onBanner("UOM rule created successfully.");
      setForm(emptyRule(partner));
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to save UOM rule.");
    }
  }

  return (
    <div>
      <div style={title}>UOM Rules</div>
      <div style={help}>Use partner-specific conversion rules so any incoming PO quantity can be normalized before IDOC or API dispatch.</div>

      <div style={grid}>
        {field("Sold-To", <input style={input} value={form.sold_to || ""} onChange={(e) => setForm({ ...form, sold_to: e.target.value })} />)}
        {field("Ship-To", <input style={input} value={form.ship_to || ""} onChange={(e) => setForm({ ...form, ship_to: e.target.value })} />)}
        {field("Material", <input style={input} value={form.material_code || ""} onChange={(e) => setForm({ ...form, material_code: e.target.value })} />)}
        {field("Input UOM", <input style={input} value={form.input_uom} onChange={(e) => setForm({ ...form, input_uom: e.target.value })} />)}
        {field("Output UOM", <input style={input} value={form.output_uom} onChange={(e) => setForm({ ...form, output_uom: e.target.value })} />)}
        {field("Factor", <input type="number" style={input} value={form.conversion_factor as any} onChange={(e) => setForm({ ...form, conversion_factor: e.target.value })} />)}
        {field("Divider", <input type="number" style={input} value={form.conversion_divider as any} onChange={(e) => setForm({ ...form, conversion_divider: e.target.value })} />)}
        {field("Rounding Digits", <input type="number" style={input} value={form.rounding_digits} onChange={(e) => setForm({ ...form, rounding_digits: Number(e.target.value || 0) })} />)}
        {field(
          "Rounding Mode",
          <select style={input} value={form.rounding_mode} onChange={(e) => setForm({ ...form, rounding_mode: e.target.value })}>
            <option value="HALF_UP">HALF_UP</option>
            <option value="UP">UP</option>
            <option value="DOWN">DOWN</option>
          </select>
        )}
      </div>

      <div style={row}>
        <button type="button" style={button} onClick={saveRow}>Add UOM Rule</button>
      </div>

      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Input</th>
            <th style={th}>Output</th>
            <th style={th}>Factor</th>
            <th style={th}>Divider</th>
            <th style={th}>Priority</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} style={td}>Loading...</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={5} style={td}>No UOM rules configured.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.uom_rule_id}>
              <td style={td}>{r.input_uom}</td>
              <td style={td}>{r.output_uom}</td>
              <td style={td}>{r.conversion_factor || "-"}</td>
              <td style={td}>{r.conversion_divider || "-"}</td>
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
