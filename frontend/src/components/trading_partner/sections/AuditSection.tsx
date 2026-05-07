import React, { useEffect, useState } from "react";
import { apiFetch, parseApiError } from "utils/api";
import { TradingPartner } from "types/tradingPartner";

const API_BASE = "/trading-partners";

type AuditRow = {
  audit_id: string;
  client_id: string;
  partner_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  before_json?: Record<string, unknown> | null;
  after_json?: Record<string, unknown> | null;
  actor_email?: string | null;
  actor_role?: string | null;
  remarks?: string | null;
  created_at: string;
};

export default function AuditSection({ partner, onBanner }: { partner: TradingPartner; onBanner?: (text: string) => void; }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!partner?.partner_id) return;
    loadAudit();
  }, [partner.partner_id]);

  async function loadAudit() {
    try {
      setLoading(true);
      const res = await apiFetch(`${API_BASE}/${partner.partner_id}/onboarding-audit`, { method: "GET" });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      onBanner?.(err?.message || "Failed to load partner audit history.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(value?: string | null) {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  }

  function formatJson(value?: Record<string, unknown> | null) {
    if (!value || Object.keys(value).length === 0) return "No snapshot";
    return JSON.stringify(value, null, 2);
  }

  return (
    <div>
      <div style={title}>Audit</div>
      <div style={subTitle}>Audit history for partner <strong>{partner.partner_name}</strong>.</div>
      {loading ? <div style={placeholder}>Loading audit history...</div> : null}
      {!loading && rows.length === 0 ? <div style={placeholder}>No audit history available for this trading partner yet.</div> : null}
      {!loading && rows.length > 0 ? (
        <div style={list}>
          {rows.map((row) => (
            <div key={row.audit_id} style={card}>
              <div style={cardHeader}>
                <div>
                  <div style={action}>{row.action.replaceAll("_", " ")}</div>
                  <div style={meta}>
                    {row.entity_type} • {row.actor_email || "System"}{row.actor_role ? ` • ${row.actor_role}` : ""}
                  </div>
                </div>
                <div style={time}>{formatDate(row.created_at)}</div>
              </div>
              {row.remarks ? <div style={remarks}>{row.remarks}</div> : null}
              <div style={snapshotGrid}>
                <div style={snapshotCard}>
                  <div style={snapshotTitle}>Before</div>
                  <pre style={snapshotText}>{formatJson(row.before_json)}</pre>
                </div>
                <div style={snapshotCard}>
                  <div style={snapshotTitle}>After</div>
                  <pre style={snapshotText}>{formatJson(row.after_json)}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const title: React.CSSProperties = { fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 8 };
const subTitle: React.CSSProperties = { fontSize: 13, color: "#64748b", marginBottom: 14 };
const placeholder: React.CSSProperties = { border: "1px dashed #cbd5e1", borderRadius: 12, padding: 20, color: "#64748b", background: "#f8fafc" };
const list: React.CSSProperties = { display: "grid", gap: 12 };
const card: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 14 };
const cardHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 10 };
const action: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: "#0f172a", textTransform: "capitalize" };
const meta: React.CSSProperties = { fontSize: 12, color: "#64748b", marginTop: 4 };
const time: React.CSSProperties = { fontSize: 12, color: "#475569", whiteSpace: "nowrap" };
const remarks: React.CSSProperties = { fontSize: 13, color: "#334155", marginBottom: 10 };
const snapshotGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const snapshotCard: React.CSSProperties = { border: "1px solid #eef2f7", borderRadius: 10, background: "#f8fafc", padding: 10, minWidth: 0 };
const snapshotTitle: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: "#334155", marginBottom: 8 };
const snapshotText: React.CSSProperties = { margin: 0, fontSize: 12, color: "#475569", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" };
