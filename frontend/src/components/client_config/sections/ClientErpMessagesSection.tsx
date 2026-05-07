import React, { useEffect, useState } from "react";
import { apiFetch, parseApiError } from "../../../utils/api";

const API_BASE = "/client-config";

type ClientRow = { client_id: string; client_name?: string };
type ErpRow = { erp_config_id: string; vertical_id?: string | null; erp_name: string; message_type: string; message_version?: string | null; format_type?: string | null; direction?: string | null; is_active?: boolean; };

type Props = {
  client: ClientRow;
  selectedVerticalId?: string;
  onBanner: (text: string, type?: "success" | "error" | "info") => void;
};

export default function ClientErpMessagesSection({ client, selectedVerticalId, onBanner }: Props) {
  const [rows, setRows] = useState<ErpRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ erp_name: "SAP", message_type: "ORDERS", message_version: "", format_type: "IDOC", direction: "INBOUND", is_active: true });

  useEffect(() => { if (client.client_id) loadRows(); }, [client.client_id]);

  async function loadRows() {
    try {
      setLoading(true);
      const res = await apiFetch(`${API_BASE}/erp/${encodeURIComponent(client.client_id)}`, { method: "GET" });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setRows(selectedVerticalId ? list.filter((x) => (x.vertical_id || "") === selectedVerticalId) : list);
    } catch (err: any) {
      onBanner(err?.message || "Failed to load ERP/message configuration.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function saveRow() {
    try {
      if (!form.erp_name.trim()) throw new Error("ERP Name is required.");
      if (!form.message_type.trim()) throw new Error("Message Type is required.");
      const res = await apiFetch(`${API_BASE}/erp`, {
        method: "POST",
        body: JSON.stringify({ client_id: client.client_id, vertical_id: selectedVerticalId || null, ...form }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      onBanner("ERP/message configuration saved successfully.", "success");
      setForm({ erp_name: "SAP", message_type: "ORDERS", message_version: "", format_type: "IDOC", direction: "INBOUND", is_active: true });
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to save ERP/message configuration.", "error");
    }
  }

  return (
    <div>
      <div style={headerRow}>
        <div>
          <div style={title}>ERP & Message Types</div>
          <div style={subtitle}>Register the ERP systems and message/version combinations supported for this client. When a vertical is active, the ERP capability is saved against that vertical.</div>
        </div>
        <div style={scopePill}>{selectedVerticalId ? "Vertical-scoped" : "Client-scoped"}</div>
      </div>
      <div style={grid3}>
        {field("ERP", <select value={form.erp_name} onChange={(e) => setForm({ ...form, erp_name: e.target.value })} style={inputStyle}><option value="SAP">SAP</option><option value="D365">D365</option><option value="ORACLE">ORACLE</option><option value="JDE">JDE</option><option value="CUSTOM">CUSTOM</option></select>)}
        {field("Message Type", <input value={form.message_type} onChange={(e) => setForm({ ...form, message_type: e.target.value })} style={inputStyle} placeholder="ORDERS / DELFOR / 850 / JSON_ORDERS" />)}
        {field("Message Version", <input value={form.message_version} onChange={(e) => setForm({ ...form, message_version: e.target.value })} style={inputStyle} placeholder="ORDERS05 / D97A / 004010" />)}
        {field("Format", <select value={form.format_type} onChange={(e) => setForm({ ...form, format_type: e.target.value })} style={inputStyle}><option value="IDOC">IDOC</option><option value="EDI">EDI</option><option value="XML">XML</option><option value="JSON">JSON</option><option value="CSV">CSV</option></select>)}
        {field("Direction", <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })} style={inputStyle}><option value="INBOUND">INBOUND</option><option value="OUTBOUND">OUTBOUND</option><option value="BOTH">BOTH</option></select>)}
        {field("Active", <select value={form.is_active ? "YES" : "NO"} onChange={(e) => setForm({ ...form, is_active: e.target.value === "YES" })} style={inputStyle}><option value="YES">YES</option><option value="NO">NO</option></select>)}
      </div>
      <div style={buttonRow}><button type="button" style={primaryButton} onClick={saveRow}>Save ERP Configuration</button></div>
      <div style={{ overflowX: "auto", marginTop: 16 }}><table style={tableStyle}><thead><tr><th style={thStyle}>ERP</th><th style={thStyle}>Message Type</th><th style={thStyle}>Version</th><th style={thStyle}>Format</th><th style={thStyle}>Direction</th><th style={thStyle}>Scope</th></tr></thead><tbody>{loading ? <tr><td colSpan={6} style={tdEmptyStyle}>Loading...</td></tr> : rows.length === 0 ? <tr><td colSpan={6} style={tdEmptyStyle}>No ERP/message types configured.</td></tr> : rows.map((row) => <tr key={row.erp_config_id}><td style={tdStyle}>{row.erp_name}</td><td style={tdStyle}>{row.message_type}</td><td style={tdStyle}>{row.message_version || "-"}</td><td style={tdStyle}>{row.format_type || "-"}</td><td style={tdStyle}>{row.direction || "-"}</td><td style={tdStyle}>{row.vertical_id ? "Vertical" : "Client"}</td></tr>)}</tbody></table></div>
    </div>
  );
}

function field(label: string, children: React.ReactNode) { return <div><div style={labelStyle}>{label}</div>{children}</div>; }
const headerRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16, flexWrap: "wrap" };
const title: React.CSSProperties = { fontSize: 18, fontWeight: 800, color: "#0f172a" };
const subtitle: React.CSSProperties = { fontSize: 12, color: "#64748b", marginTop: 4, maxWidth: 760 };
const scopePill: React.CSSProperties = { border: "1px solid #dbe4ee", background: "#fff", color: "#334155", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 700 };
const grid3: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: "100%", minHeight: 40, padding: "8px 10px", borderRadius: 10, border: "1px solid #dbe4ee", background: "#fff", fontSize: 13, color: "#0f172a", outline: "none", boxSizing: "border-box" };
const buttonRow: React.CSSProperties = { display: "flex", gap: 10, marginTop: 14 };
const primaryButton: React.CSSProperties = { border: "1px solid #0b5fff", background: "#0b5fff", color: "#fff", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", marginTop: 12 };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 12, fontWeight: 800, color: "#334155", borderBottom: "1px solid #e5e7eb", background: "#f8fafc" };
const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "#0f172a", borderBottom: "1px solid #eef2f7" };
const tdEmptyStyle: React.CSSProperties = { padding: "16px 12px", fontSize: 13, color: "#64748b", borderBottom: "1px solid #eef2f7" };
