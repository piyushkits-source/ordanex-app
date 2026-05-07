import { useEffect, useMemo, useState } from "react";
import { FaDownload, FaFileCsv, FaRotateRight } from "react-icons/fa6";
import PageHeader from "../components/common/PageHeader";
import { apiFetch, parseApiError } from "../utils/api";
import { getAuth } from "../utils/auth";

type SummaryPoint = {
  label: string;
  value: number;
};

type ExceptionRow = {
  po_id: string;
  po_number?: string | null;
  status?: string | null;
  client_id?: string | null;
  sender?: string | null;
  receiver?: string | null;
  source_type?: string | null;
  connector_used?: string | null;
  created_at?: string | null;
  processed_at?: string | null;
  reason?: string | null;
};

type DashboardSummary = {
  environment: string;
  total: number;
  success: number;
  failed: number;
  pending: number;
  by_connector: Record<string, number>;
  by_status: Record<string, number>;
  top_clients: SummaryPoint[];
  top_suppliers: SummaryPoint[];
  recent_exceptions: ExceptionRow[];
};

type FilterOption = {
  client_id?: string;
  client_name?: string;
  vertical_id?: string;
  vertical_name?: string;
  partner_id?: string;
  partner_name?: string;
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 18,
};

const button: React.CSSProperties = {
  border: "1px solid #dbe2ea",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 700,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const auth = getAuth();
  const role = String(auth?.role || "").toLowerCase();
  const [environment, setEnvironment] = useState("PROD");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [clients, setClients] = useState<FilterOption[]>([]);
  const [verticals, setVerticals] = useState<FilterOption[]>([]);
  const [partners, setPartners] = useState<FilterOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(auth?.client_id || "");
  const [selectedVerticalId, setSelectedVerticalId] = useState("");
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadFilters(nextClientId?: string, nextVerticalId?: string) {
    const params = new URLSearchParams();
    const clientId = nextClientId ?? selectedClientId;
    const verticalId = nextVerticalId ?? selectedVerticalId;
    if (clientId) params.set("client_id", clientId);
    if (verticalId) params.set("vertical_id", verticalId);

    const res = await apiFetch(`/monitoring-dashboard/filters?${params.toString()}`);
    if (!res.ok) {
      throw new Error(await parseApiError(res));
    }
    const data = await res.json();
    setClients(Array.isArray(data.clients) ? data.clients : []);
    setVerticals(Array.isArray(data.verticals) ? data.verticals : []);
    setPartners(Array.isArray(data.partners) ? data.partners : []);
    if (!clientId && data.effective_client_id) {
      setSelectedClientId(data.effective_client_id);
    }
  }

  async function loadSummary() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ environment });
      if (selectedClientId) params.set("client_id", selectedClientId);
      if (selectedVerticalId) params.set("vertical_id", selectedVerticalId);
      if (selectedPartnerId) params.set("partner_id", selectedPartnerId);
      const res = await apiFetch(`/monitoring-dashboard/summary?${params.toString()}`);
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      setSummary(await res.json());
    } catch (err: any) {
      setError(err?.message || "Failed to load reports.");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFilters().catch((err: any) => setError(err?.message || "Failed to load filters."));
  }, []);

  useEffect(() => {
    loadSummary();
  }, [environment, selectedClientId, selectedVerticalId, selectedPartnerId]);

  const exportRows = useMemo(() => {
    const exceptions = summary?.recent_exceptions || [];
    return [
      ["PO Number", "Status", "Client", "Sender", "Receiver", "Source", "Connector", "Created At", "Reason"],
      ...exceptions.map((row) => [
        row.po_number || row.po_id,
        row.status || "",
        row.client_id || "",
        row.sender || "",
        row.receiver || "",
        row.source_type || "",
        row.connector_used || "",
        row.created_at || "",
        row.reason || "",
      ]),
    ];
  }, [summary]);

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Operational exports and audit-friendly summaries built from live monitoring data."
        right={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {role === "super_admin" ? (
              <select
                value={selectedClientId}
                onChange={(e) => {
                  const next = e.target.value;
                  setSelectedClientId(next);
                  setSelectedVerticalId("");
                  setSelectedPartnerId("");
                  loadFilters(next, "").catch(() => null);
                }}
                style={{ ...button, padding: "10px 12px" }}
              >
                <option value="">All Clients</option>
                {clients.map((client) => (
                  <option key={client.client_id} value={client.client_id}>
                    {client.client_name || client.client_id}
                  </option>
                ))}
              </select>
            ) : null}
            <select
              value={selectedVerticalId}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedVerticalId(next);
                setSelectedPartnerId("");
                loadFilters(selectedClientId, next).catch(() => null);
              }}
              style={{ ...button, padding: "10px 12px" }}
            >
              <option value="">All Verticals</option>
              {verticals.map((vertical) => (
                <option key={vertical.vertical_id} value={vertical.vertical_id}>
                  {vertical.vertical_name}
                </option>
              ))}
            </select>
            <select
              value={selectedPartnerId}
              onChange={(e) => setSelectedPartnerId(e.target.value)}
              style={{ ...button, padding: "10px 12px" }}
            >
              <option value="">All Trading Partners</option>
              {partners.map((partner) => (
                <option key={partner.partner_id} value={partner.partner_id}>
                  {partner.partner_name}
                </option>
              ))}
            </select>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              style={{ ...button, padding: "10px 12px" }}
            >
              <option value="PROD">PROD</option>
              <option value="STAGING">STAGING</option>
            </select>
            <button type="button" onClick={loadSummary} style={button}>
              <FaRotateRight /> Refresh
            </button>
            <button
              type="button"
              onClick={() => downloadCsv(`ordanex-report-${environment.toLowerCase()}.csv`, exportRows)}
              style={button}
              disabled={!summary}
            >
              <FaFileCsv /> Export CSV
            </button>
          </div>
        }
      />

      {error ? (
        <div style={{ ...card, borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c", marginBottom: 16 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 14, marginBottom: 16 }}>
        {[
          ["Total Orders", summary?.total ?? 0],
          ["Successful", summary?.success ?? 0],
          ["Pending", summary?.pending ?? 0],
          ["Failed", summary?.failed ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} style={card}>
            <div style={{ color: "#64748b", fontSize: 13 }}>{label}</div>
            <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>{loading ? "..." : value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 16 }}>
        <section style={card}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Recent Exceptions</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#64748b" }}>
                  <th style={{ padding: "8px 0" }}>PO</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Created</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.recent_exceptions || []).map((row) => (
                  <tr key={row.po_id} style={{ borderTop: "1px solid #eef2f7" }}>
                    <td style={{ padding: "10px 0", fontWeight: 700 }}>{row.po_number || row.po_id}</td>
                    <td>{row.status || "-"}</td>
                    <td>{row.source_type || row.connector_used || "-"}</td>
                    <td>{formatDateTime(row.created_at)}</td>
                    <td style={{ color: "#64748b" }}>{row.reason || "-"}</td>
                  </tr>
                ))}
                {!loading && !(summary?.recent_exceptions || []).length ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "14px 0", color: "#64748b" }}>
                      No recent exceptions for this environment.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section style={card}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Top Clients</div>
          {(summary?.top_clients || []).map((point) => (
            <div key={point.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #eef2f7" }}>
              <span style={{ color: "#334155" }}>{point.label}</span>
              <strong>{point.value}</strong>
            </div>
          ))}
          {!loading && !(summary?.top_clients || []).length ? (
            <div style={{ color: "#64748b" }}>No client volume yet.</div>
          ) : null}
        </section>

        <section style={card}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Top Suppliers</div>
          {(summary?.top_suppliers || []).map((point) => (
            <div key={point.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #eef2f7" }}>
              <span style={{ color: "#334155" }}>{point.label}</span>
              <strong>{point.value}</strong>
            </div>
          ))}
          {!loading && !(summary?.top_suppliers || []).length ? (
            <div style={{ color: "#64748b" }}>No supplier volume yet.</div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
