import { useEffect, useMemo, useState } from "react";
import { FaRotateRight } from "react-icons/fa6";
import PageHeader from "../components/common/PageHeader";
import { apiFetch, parseApiError } from "../utils/api";
import { getAuth } from "../utils/auth";

type DailyPoint = {
  date: string;
  total: number;
  success: number;
  failed: number;
  pending: number;
};

type SummaryPoint = {
  label: string;
  value: number;
};

type DashboardSummary = {
  environment: string;
  total: number;
  success: number;
  failed: number;
  pending: number;
  by_connector: Record<string, number>;
  by_status: Record<string, number>;
  daily_volume: DailyPoint[];
  manual_touch_count: number;
  auto_processed_count: number;
  manual_touch_rate: number;
  avg_processing_latency_hours: number;
  top_clients: SummaryPoint[];
  top_suppliers: SummaryPoint[];
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

function TinyBarChart({
  data,
  color,
}: {
  data: { label: string; value: number }[];
  color: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {data.map((point) => (
        <div key={point.label}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
            <span>{point.label}</span>
            <strong>{point.value}</strong>
          </div>
          <div style={{ height: 10, background: "#eef2f7", borderRadius: 999 }}>
            <div
              style={{
                width: `${(point.value / max) * 100}%`,
                height: "100%",
                borderRadius: 999,
                background: color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
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
      setError(err?.message || "Failed to load analytics.");
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

  const statusBars = useMemo(
    () =>
      Object.entries(summary?.by_status || {})
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value })),
    [summary]
  );

  const connectorBars = useMemo(
    () =>
      Object.entries(summary?.by_connector || {})
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value })),
    [summary]
  );

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Live operational KPIs, trend signals, and throughput quality."
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
          ["Manual Touch Rate", `${summary?.manual_touch_rate ?? 0}%`],
          ["Avg Processing Latency", `${summary?.avg_processing_latency_hours ?? 0}h`],
          ["Auto Processed", summary?.auto_processed_count ?? 0],
          ["Manual / Exception", summary?.manual_touch_count ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} style={card}>
            <div style={{ color: "#64748b", fontSize: 13 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{loading ? "..." : value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 16 }}>
        <section style={card}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>7-Day Volume Trend</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(summary?.daily_volume?.length || 1, 1)}, minmax(0,1fr))`, gap: 10, alignItems: "end", minHeight: 220 }}>
            {(summary?.daily_volume || []).map((point) => {
              const max = Math.max(...(summary?.daily_volume || []).map((d) => d.total), 1);
              const height = `${Math.max((point.total / max) * 160, point.total ? 24 : 8)}px`;
              return (
                <div key={point.date} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 8 }}>
                  <div style={{ fontSize: 12, textAlign: "center", color: "#475569", fontWeight: 700 }}>{point.total}</div>
                  <div
                    style={{
                      height,
                      borderRadius: 14,
                      background: "linear-gradient(180deg, #0ea5e9 0%, #2563eb 100%)",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ position: "absolute", inset: 0, opacity: 0.16, background: "repeating-linear-gradient(135deg, #ffffff, #ffffff 6px, transparent 6px, transparent 12px)" }} />
                  </div>
                  <div style={{ fontSize: 12, textAlign: "center", color: "#64748b" }}>{point.date.slice(5)}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section style={card}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Status Mix</div>
          <TinyBarChart data={statusBars} color="#2563eb" />
        </section>

        <section style={card}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Connector Mix</div>
          <TinyBarChart data={connectorBars} color="#0f766e" />
        </section>
      </div>
    </div>
  );
}
