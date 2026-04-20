import React, { useEffect, useState } from "react";
import { apiFetch, parseApiError } from "utils/api";
import { TradingPartner } from "types/tradingPartner";

const API_BASE = "/trading-partners-agentic";

type ProjectRow = {
  project_id: string;
  partner_id: string;
  message_family: string;
  message_standard: string;
  message_version?: string | null;
  direction: string;
  profile_name: string;
  status: string;
};

export default function AIOnboardingSection({ partner, onBanner }: { partner: TradingPartner; onBanner: (text: string) => void; }) {
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    client_id: partner.client_id,
    partner_id: partner.partner_id,
    profile_name: `${partner.partner_name} Default`,
    message_family: "PURCHASE_ORDER",
    message_standard: "PAPER_PO",
    message_version: "",
    direction: "INBOUND",
    sample_reference: "",
    target_message_family: "ORDERS",
    extraction_mode: "HYBRID_AI_OCR",
  });

  useEffect(() => { loadRows(); }, [partner.partner_id]);

  async function loadRows() {
    try {
      setLoading(true);
      const res = await apiFetch(`${API_BASE}/projects?partner_id=${partner.partner_id}`, { method: "GET" });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      onBanner(err?.message || "Failed to load agentic onboarding projects.");
    } finally {
      setLoading(false);
    }
  }

  async function createProject() {
    try {
      const res = await apiFetch(`${API_BASE}/projects`, { method: "POST", body: JSON.stringify(form) });
      if (!res.ok) throw new Error(await parseApiError(res));
      onBanner("Agentic onboarding project created.");
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to create agentic onboarding project.");
    }
  }

  async function runDiscovery() {
    try {
      const res = await apiFetch(`${API_BASE}/discover`, { method: "POST", body: JSON.stringify(form) });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      onBanner(`Discovery completed. Suggested standard: ${data.message_standard}, version: ${data.message_version || "-"}.`);
    } catch (err: any) {
      onBanner(err?.message || "Discovery failed.");
    }
  }

  return (
    <div>
      <div style={title}>Agentic AI Onboarding</div>
      <div style={subTitle}>Message-agnostic onboarding for paper PO, EDIFACT, X12, XML, JSON, and future message families like ORDRSP, ORDCHG, DESADV, and INVOIC.</div>

      <div style={grid}>
        {field("Profile Name", <input value={form.profile_name} onChange={(e) => setForm({ ...form, profile_name: e.target.value })} style={input} />)}
        {field("Direction", <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })} style={input}><option>INBOUND</option><option>OUTBOUND</option><option>BOTH</option></select>)}
        {field("Message Family", <select value={form.message_family} onChange={(e) => setForm({ ...form, message_family: e.target.value })} style={input}><option>PURCHASE_ORDER</option><option>ORDER_RESPONSE</option><option>ORDER_CHANGE</option><option>ASN</option><option>INVOICE</option></select>)}
        {field("Message Standard", <select value={form.message_standard} onChange={(e) => setForm({ ...form, message_standard: e.target.value })} style={input}><option>PAPER_PO</option><option>EDIFACT</option><option>X12</option><option>XML</option><option>JSON</option><option>CSV</option><option>EMAIL_BODY</option></select>)}
        {field("Message Version", <input placeholder="e.g. D96A, D01B, 4010" value={form.message_version} onChange={(e) => setForm({ ...form, message_version: e.target.value })} style={input} />)}
        {field("Target Message Family", <select value={form.target_message_family} onChange={(e) => setForm({ ...form, target_message_family: e.target.value })} style={input}><option>ORDERS</option><option>ORDRSP</option><option>ORDCHG</option><option>DESADV</option><option>INVOIC</option></select>)}
        {field("Extraction Mode", <select value={form.extraction_mode} onChange={(e) => setForm({ ...form, extraction_mode: e.target.value })} style={input}><option>HYBRID_AI_OCR</option><option>EDI_PARSER</option><option>XML_MAP</option><option>JSON_MAP</option><option>CSV_MAP</option></select>)}
        {field("Sample Reference", <input placeholder="sample file / email ref / message id" value={form.sample_reference} onChange={(e) => setForm({ ...form, sample_reference: e.target.value })} style={input} />)}
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" style={primaryButton} onClick={createProject}>Create Onboarding Project</button>
        <button type="button" style={secondaryButton} onClick={runDiscovery}>Run Discovery</button>
      </div>

      <div style={infoCard}>
        <div style={infoTitle}>Design model</div>
        <div style={infoBody}>
          The GUI is message-family driven. Add support for new partner message types using registry + onboarding profiles rather than redesigning backend tables.
        </div>
      </div>

      <div style={{ overflowX: "auto", marginTop: 18 }}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Profile</th>
              <th style={th}>Family</th>
              <th style={th}>Standard</th>
              <th style={th}>Version</th>
              <th style={th}>Direction</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={tdEmpty}>Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} style={tdEmpty}>No agentic onboarding projects configured.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.project_id}>
                <td style={td}>{row.profile_name}</td>
                <td style={td}>{row.message_family}</td>
                <td style={td}>{row.message_standard}</td>
                <td style={td}>{row.message_version || "-"}</td>
                <td style={td}>{row.direction}</td>
                <td style={td}>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function field(label: string, child: React.ReactNode) { return <div><div style={labelStyle}>{label}</div>{child}</div>; }
const title: React.CSSProperties = { fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 8 };
const subTitle: React.CSSProperties = { fontSize: 13, color: "#64748b", marginBottom: 14 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 };
const input: React.CSSProperties = { width: "100%", minHeight: 38, padding: "8px 10px", borderRadius: 8, border: "1px solid #dbe4ee", boxSizing: "border-box" };
const primaryButton: React.CSSProperties = { border: "1px solid #0b5fff", background: "#0b5fff", color: "#fff", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const secondaryButton: React.CSSProperties = { border: "1px solid #dbe4ee", background: "#fff", color: "#0f172a", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const infoCard: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, background: "#f8fafc", padding: 14, marginTop: 16 };
const infoTitle: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: "#0f172a", marginBottom: 6 };
const infoBody: React.CSSProperties = { fontSize: 13, color: "#475569", lineHeight: 1.5 };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 12, fontWeight: 800, color: "#334155", borderBottom: "1px solid #e5e7eb", background: "#f8fafc" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "#0f172a", borderBottom: "1px solid #eef2f7" };
const tdEmpty: React.CSSProperties = { padding: "16px 12px", fontSize: 13, color: "#64748b", borderBottom: "1px solid #eef2f7" };
