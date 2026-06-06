import React, { useEffect, useState } from "react";
import { apiFetch, parseApiError } from "utils/api";
import { NotificationRow, TradingPartner } from "types/tradingPartner";

const API_BASE = "/trading-partners";

const defaultNotification = (partnerId: string): NotificationRow => ({
  partner_id: partnerId,
  email: "",
  notification_type: "FAILED",
  include_attachment: true,
  is_active: true,
});

export default function NotificationSection({
  partner,
  onBanner,
}: {
  partner: TradingPartner;
  onBanner: (text: string) => void;
}) {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [form, setForm] = useState<NotificationRow>(defaultNotification(partner.partner_id));
  const [loading, setLoading] = useState(false);
  const endpoint = `${API_BASE}/${encodeURIComponent(partner.partner_id)}/notifications`;

  useEffect(() => {
    setForm(defaultNotification(partner.partner_id));
    void loadRows();
  }, [partner.partner_id]);

  async function loadRows() {
    try {
      setLoading(true);
      const res = await apiFetch(endpoint, { method: "GET" });
      if (res.status === 404) {
        setRows([]);
        return;
      }
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      onBanner(err?.message || "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }

  async function saveRow() {
    try {
      const res = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, partner_id: partner.partner_id }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      onBanner("Notification rule saved successfully.");
      setForm(defaultNotification(partner.partner_id));
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to save notification rule.");
    }
  }

  return (
    <div style={card}>
      <div style={title}>Notifications</div>
      <div style={grid}>
        {field(
          "Recipient Email",
          <input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            style={input}
          />
        )}
        {field(
          "Notification Type",
          <select
            value={form.notification_type}
            onChange={(e) => setForm({ ...form, notification_type: e.target.value })}
            style={input}
          >
            <option value="SUCCESS">SUCCESS</option>
            <option value="PENDING">PENDING</option>
            <option value="FAILED">FAILED</option>
          </select>
        )}
        {field(
          "Include Attachment",
          <select
            value={form.include_attachment ? "YES" : "NO"}
            onChange={(e) => setForm({ ...form, include_attachment: e.target.value === "YES" })}
            style={input}
          >
            <option value="YES">YES</option>
            <option value="NO">NO</option>
          </select>
        )}
        {field(
          "Active",
          <select
            value={form.is_active ? "YES" : "NO"}
            onChange={(e) => setForm({ ...form, is_active: e.target.value === "YES" })}
            style={input}
          >
            <option value="YES">YES</option>
            <option value="NO">NO</option>
          </select>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button type="button" style={primaryButton} onClick={saveRow}>
          Save Notification
        </button>
      </div>
      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Attachment</th>
              <th style={thStyle}>Active</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} style={tdEmptyStyle}>Loading...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} style={tdEmptyStyle}>No notifications configured.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.notification_id || `${row.email}-${row.notification_type}`}>
                  <td style={tdStyle}>{row.email}</td>
                  <td style={tdStyle}>{row.notification_type}</td>
                  <td style={tdStyle}>{row.include_attachment ? "YES" : "NO"}</td>
                  <td style={tdStyle}>{row.is_active ? "YES" : "NO"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function field(label: string, child: React.ReactNode) {
  return <div><div style={labelStyle}>{label}</div>{child}</div>;
}

const card: React.CSSProperties = { border: "1px solid #eef2f7", borderRadius: 12, background: "#fff", padding: 16 };
const title: React.CSSProperties = { fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 14 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 };
const input: React.CSSProperties = { width: "100%", minHeight: 38, padding: "8px 10px", borderRadius: 8, border: "1px solid #dbe4ee", background: "#fff", fontSize: 13, color: "#0f172a", outline: "none", boxSizing: "border-box" };
const primaryButton: React.CSSProperties = { border: "1px solid #0b5fff", background: "#0b5fff", color: "#fff", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", marginTop: 12 };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 12, fontWeight: 800, color: "#334155", borderBottom: "1px solid #e5e7eb", background: "#f8fafc", verticalAlign: "top" };
const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "#0f172a", borderBottom: "1px solid #eef2f7", verticalAlign: "top" };
const tdEmptyStyle: React.CSSProperties = { padding: "16px 12px", fontSize: 13, color: "#64748b", borderBottom: "1px solid #eef2f7" };
