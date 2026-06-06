import React, { useEffect, useMemo, useState } from "react";
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
  color?: string;
};

type RecentException = {
  po_id?: string;
  po_number?: string;
  status?: string;
  client_id?: string;
  sender?: string;
  receiver?: string;
  source_type?: string;
  connector_used?: string;
  created_at?: string;
  processed_at?: string;
  reason?: string;
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
  recent_exceptions?: RecentException[];
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
  data: { label: string; value: number; color?: string }[];
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
                background: point.color || color,
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
        .map(([label, value]) => ({
          label,
          value,
          color:
            /fail|error|reject|exception|cancel/i.test(label)
              ? '#b91c1c'
              : /pend|new|hold|queue|processing/i.test(label)
                ? '#b45309'
                : '#15803d',
        })),
    [summary]
  );

  const connectorBars = useMemo(
    () =>
      Object.entries(summary?.by_connector || {})
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({
          label,
          value,
          color:
            /email|manual|exception/i.test(label)
              ? '#b45309'
              : /api|sap|oracle|d365|netsuite|ariba|coupa|sps|erp/i.test(label)
                ? '#15803d'
                : /sftp|ftp|edi|x12|edifact/i.test(label)
                  ? '#b91c1c'
                  : '#0f766e',
        })),
    [summary]
  );

  const insights = useMemo(() => {
    const topClient = summary?.top_clients?.[0];
    const topSupplier = summary?.top_suppliers?.[0];
    const recentException = summary?.recent_exceptions?.[0];
    const topConnector = connectorBars[0];
    const slowLane = (summary?.avg_processing_latency_hours ?? 0) >= 24 ? "High" : (summary?.avg_processing_latency_hours ?? 0) >= 6 ? "Moderate" : "Healthy";

    return [
      { title: "Processing Health", value: slowLane, detail: `Avg latency ${summary?.avg_processing_latency_hours ?? 0}h` },
      { title: "Top Connector", value: topConnector?.label || "-", detail: `${topConnector?.value ?? 0} messages` },
      { title: "Highest Client Volume", value: topClient?.label || "-", detail: `${topClient?.value ?? 0} messages` },
      { title: "Top Supplier", value: topSupplier?.label || "-", detail: `${topSupplier?.value ?? 0} messages` },
      {
        title: "Latest Exception",
        value: recentException?.status || "None",
        detail: recentException ? `${recentException.po_number || recentException.po_id || "Unknown document"}` : "No exceptions in the selected range",
      },
      { title: "Automation Split", value: `${summary?.auto_processed_count ?? 0} auto`, detail: `${summary?.manual_touch_count ?? 0} manual` },
    ];
  }, [summary, connectorBars]);

  const operationalSignals = useMemo(() => {
    const daily = summary?.daily_volume || [];
    const recentDays = daily.slice(-3);
    const previousDays = daily.slice(-7, -3);
    const recentTotal = recentDays.reduce((acc, point) => acc + (point.total || 0), 0);
    const previousTotal = previousDays.reduce((acc, point) => acc + (point.total || 0), 0);
    const trendDelta = previousTotal ? Math.round(((recentTotal - previousTotal) / previousTotal) * 100) : recentTotal ? 100 : 0;

    const exceptionAgingHours = (summary?.recent_exceptions || [])
      .map((item) => {
        const created = item.created_at ? new Date(item.created_at).getTime() : 0;
        const processed = item.processed_at ? new Date(item.processed_at).getTime() : Date.now();
        if (!created) return 0;
        return Math.max((processed - created) / 3600000, 0);
      })
      .filter((value) => value > 0);
    const avgExceptionAge = exceptionAgingHours.length
      ? Math.round((exceptionAgingHours.reduce((acc, value) => acc + value, 0) / exceptionAgingHours.length) * 10) / 10
      : 0;

    const byConnector = Object.entries(summary?.by_connector || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, value]) => `${label}: ${value}`);

    const warning =
      (summary?.avg_processing_latency_hours || 0) >= 24
        ? "SLA breach risk"
        : (summary?.avg_processing_latency_hours || 0) >= 8
          ? "SLA watch"
          : "Within SLA";

    const recentIssueCount = summary?.recent_exceptions?.length || 0;
    const trendSeverity = trendDelta < 0 ? "high" : trendDelta >= 20 ? "low" : "medium";
    const exceptionSeverity = avgExceptionAge >= 24 || recentIssueCount >= 10 ? "high" : avgExceptionAge >= 8 || recentIssueCount >= 4 ? "medium" : "low";
    const driverSeverity = byConnector[0] && byConnector[0].includes("EMAIL") ? "medium" : "low";
    const slaSeverity = warning === "SLA breach risk" ? "high" : warning === "SLA watch" ? "medium" : "low";

    return [
      { title: "Throughput Trend", value: trendDelta >= 0 ? `+${trendDelta}%` : `${trendDelta}%`, detail: `Last 3 days vs previous 4 days`, severity: trendSeverity },
      { title: "Exception Aging", value: `${avgExceptionAge}h`, detail: `${recentIssueCount} recent exceptions`, severity: exceptionSeverity },
      { title: "Manual Touch Drivers", value: byConnector[0] || "No data", detail: byConnector.slice(1).join(" ? ") || "Top connectors by volume", severity: driverSeverity },
      { title: "SLA Status", value: warning, detail: `Avg latency ${summary?.avg_processing_latency_hours ?? 0}h`, severity: slaSeverity },
    ];
  }, [summary]);

  const executiveMetrics = useMemo(() => {
    const manualTouchRate = summary?.manual_touch_rate ?? 0;
    const latency = summary?.avg_processing_latency_hours ?? 0;
    const manualCount = summary?.manual_touch_count ?? 0;
    const autoCount = summary?.auto_processed_count ?? 0;
    const manualRateSeverity = manualTouchRate >= 40 ? "high" : manualTouchRate >= 20 ? "medium" : "low";
    const latencySeverity = latency >= 24 ? "high" : latency >= 8 ? "medium" : "low";
    const autoSeverity = autoCount >= manualCount ? "low" : "medium";
    const manualSeverity = manualCount >= autoCount ? "high" : manualCount >= autoCount * 0.5 ? "medium" : "low";

    return [
      {
        label: "Manual Touch Rate",
        value: `${manualTouchRate}%`,
        detail: manualTouchRate >= 40 ? "High exception load" : manualTouchRate >= 20 ? "Moderate exception load" : "Healthy automation",
        severity: manualRateSeverity,
      },
      { label: "Avg Processing Latency", value: `${latency}h`, detail: latency >= 24 ? "SLA breach risk" : latency >= 8 ? "SLA watch" : "Within SLA", severity: latencySeverity },
      { label: "Auto Processed", value: `${autoCount}`, detail: autoCount >= manualCount ? "Automation leading" : "Manual still heavier", severity: autoSeverity },
      { label: "Manual / Exception", value: `${manualCount}`, detail: manualCount >= autoCount ? "Manual lane needs focus" : "Manual lane under control", severity: manualSeverity },
    ];
  }, [summary]);

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
            <select value={environment} onChange={(e) => setEnvironment(e.target.value)} style={{ ...button, padding: "10px 12px" }}>
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
        <div style={{ ...card, borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c", marginBottom: 16 }}>{error}</div>
      ) : null}

      <section style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Operational Insights</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          {insights.map((item) => (
            <div key={item.title} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)" }}>
              <div style={{ color: "#64748b", fontSize: 12, fontWeight: 700, letterSpacing: 0.02 }}>{item.title}</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: "#0f172a" }}>{item.value}</div>
              <div style={{ marginTop: 4, color: "#475569", fontSize: 13 }}>{item.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Advanced Signals</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          {operationalSignals.map((item) => {
            const palette =
              item.severity === "high"
                ? { border: "#fecaca", background: "linear-gradient(180deg, #fff5f5 0%, #fff1f2 100%)", accent: "#b91c1c" }
                : item.severity === "medium"
                  ? { border: "#fde68a", background: "linear-gradient(180deg, #fffbeb 0%, #fefce8 100%)", accent: "#b45309" }
                  : { border: "#bbf7d0", background: "linear-gradient(180deg, #f0fdf4 0%, #f8fafc 100%)", accent: "#15803d" };
            return (
              <div
                key={item.title}
                style={{
                  border: `1px solid ${palette.border}`,
                  borderRadius: 14,
                  padding: 14,
                  background: palette.background,
                  boxShadow:
                    item.severity === "high"
                      ? "0 10px 24px rgba(185, 28, 28, 0.08)"
                      : item.severity === "medium"
                        ? "0 10px 24px rgba(180, 83, 9, 0.06)"
                        : "0 10px 24px rgba(21, 128, 61, 0.05)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ color: "#64748b", fontSize: 12, fontWeight: 700, letterSpacing: 0.02 }}>{item.title}</div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: palette.accent, textTransform: "uppercase", letterSpacing: 0.08 }}>
                    {item.severity}
                  </span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: palette.accent }}>{item.value}</div>
                <div style={{ marginTop: 4, color: "#475569", fontSize: 13 }}>{item.detail}</div>
              </div>
            );
          })}
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 14, marginBottom: 16 }}>
        {executiveMetrics.map((item) => {
          const palette =
            item.severity === "high"
              ? { border: "#fecaca", background: "linear-gradient(180deg, #fff5f5 0%, #fff1f2 100%)", accent: "#b91c1c" }
              : item.severity === "medium"
                ? { border: "#fde68a", background: "linear-gradient(180deg, #fffbeb 0%, #fefce8 100%)", accent: "#b45309" }
                : { border: "#bbf7d0", background: "linear-gradient(180deg, #f0fdf4 0%, #f8fafc 100%)", accent: "#15803d" };
          return (
            <div
              key={item.label}
              style={{
                border: `1px solid ${palette.border}`,
                background: palette.background,
                borderRadius: 16,
                padding: 18,
                boxShadow:
                  item.severity === "high"
                    ? "0 10px 24px rgba(185, 28, 28, 0.08)"
                    : item.severity === "medium"
                      ? "0 10px 24px rgba(180, 83, 9, 0.06)"
                      : "0 10px 24px rgba(21, 128, 61, 0.05)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ color: "#64748b", fontSize: 13, fontWeight: 700 }}>{item.label}</div>
                <span style={{ fontSize: 11, fontWeight: 800, color: palette.accent, textTransform: "uppercase", letterSpacing: 0.08 }}>
                  {item.severity}
                </span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8, color: palette.accent }}>{loading ? "..." : item.value}</div>
              <div style={{ marginTop: 6, color: "#475569", fontSize: 13 }}>{item.detail}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 16 }}>
        <section style={card}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>7-Day Volume Trend</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(summary?.daily_volume?.length || 1, 1)}, minmax(0,1fr))`, gap: 10, alignItems: "end", minHeight: 220 }}>
            {(summary?.daily_volume || []).map((point) => {
              const max = Math.max(...(summary?.daily_volume || []).map((d) => d.total), 1);
              const height = `${Math.max((point.total / max) * 160, point.total ? 24 : 8)}px`;
              const barColor =
                point.failed > point.success && point.failed >= point.pending
                  ? "#b91c1c"
                  : point.pending > point.success
                    ? "#b45309"
                    : "#15803d";
              const gradientEnd = barColor === "#b91c1c" ? "#ef4444" : barColor === "#b45309" ? "#f59e0b" : "#22c55e";
              return (
                <div key={point.date} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 8 }}>
                  <div style={{ fontSize: 12, textAlign: "center", color: "#475569", fontWeight: 700 }}>{point.total}</div>
                  <div
                    style={{
                      height,
                      borderRadius: 14,
                      background: `linear-gradient(180deg, ${barColor} 0%, ${gradientEnd} 100%)`,
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
