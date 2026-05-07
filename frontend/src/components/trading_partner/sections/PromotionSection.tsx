import React, { useEffect, useState } from "react";
import { apiFetch, parseApiError } from "utils/api";
import { getAccessToken } from "utils/auth";
import { normalizeEnvironmentLabel, workspaceEnvironmentBadge } from "utils/environment";
import { TradingPartner } from "types/tradingPartner";
import { useAppScope } from "context/AppScopeContext";

export default function PromotionSection({
  partner,
  onBanner,
}: {
  partner: TradingPartner;
  onBanner: (text: string) => void;
}) {
  const { scope } = useAppScope();
  const [environment, setEnvironment] = useState("UNKNOWN");
  const [loadingEnvironment, setLoadingEnvironment] = useState(true);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [preview, setPreview] = useState<any | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (scope.environment) {
      setEnvironment(workspaceEnvironmentBadge(scope.environment));
    } else {
      void loadEnvironment();
    }
  }, [scope.environment]);

  useEffect(() => {
    void loadHistory();
  }, [partner.partner_id]);

  async function loadEnvironment() {
    try {
      setLoadingEnvironment(true);
      const res = await apiFetch("/system/environment", { method: "GET" });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      setEnvironment(normalizeEnvironmentLabel(data?.environment));
    } catch (err: any) {
      setEnvironment("UNKNOWN");
      onBanner(err?.message || "Unable to determine current environment.");
    } finally {
      setLoadingEnvironment(false);
    }
  }

  async function loadHistory() {
    try {
      setLoadingHistory(true);
      const res = await apiFetch(`/trading-partners/${partner.partner_id}/promotion-history`, { method: "GET" });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (err: any) {
      onBanner(err?.message || "Unable to load promotion history.");
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  function buildPreview(payload: any) {
    const meta = payload?.meta || {};
    const counts = meta?.domain_counts || {};
    return {
      partnerCode: meta?.partner_code || payload?.partner?.partner_code || "-",
      partnerName: meta?.partner_name || payload?.partner?.partner_name || "-",
      version: meta?.package_version || "-",
      sourceEnvironment: meta?.source_environment || "-",
      targetEnvironment: meta?.target_environment || "-",
      domains: Array.isArray(meta?.config_domains) ? meta.config_domains : [],
      counts,
    };
  }

  async function downloadPackage() {
    try {
      setBusy(true);
      const res = await apiFetch(`/trading-partners/${partner.partner_id}/promotion-package`, { method: "GET" });
      if (!res.ok) throw new Error(await parseApiError(res));
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${partner.partner_code}_promotion_package.json`;
      anchor.click();
      window.URL.revokeObjectURL(url);
      onBanner("Promotion package exported from staging.");
      await loadHistory();
    } catch (err: any) {
      onBanner(err?.message || "Unable to export promotion package.");
    } finally {
      setBusy(false);
    }
  }

  async function importPackage(file: File) {
    try {
      setBusy(true);
      const raw = await file.text();
      const payload = JSON.parse(raw);
      setPreview(buildPreview(payload));
      const token = getAccessToken();
      const res = await fetch("/trading-partners/promotion-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      const imported = data?.summary?.imported_counts || {};
      onBanner(`Promotion package imported into production. Connections: ${imported.connections ?? 0}, mappings: ${imported.mapping_profiles ?? 0}, rules: ${imported.business_rules ?? 0}, parser profiles: ${imported.parser_profiles ?? 0}, notifications: ${imported.notifications ?? 0}.`);
      await loadHistory();
    } catch (err: any) {
      onBanner(err?.message || "Unable to import promotion package.");
    } finally {
      setBusy(false);
    }
  }

  const isStaging = environment === "STAGING";
  const isProduction = environment === "PRODUCTION";

  return (
    <div>
      <div style={title}>Environment Promotion</div>
      <div style={subTitle}>
        Staging and production stay fully separate. Promote the client workspace setup and partner configuration by exporting a package from staging and importing it into production, with audit entries on both sides.
      </div>

      <div style={heroCard}>
        <div style={heroMeta}>
          <div style={heroLabel}>Current Environment</div>
          <div
            style={{
              ...heroValue,
              color: isProduction ? "#b91c1c" : "#047857",
            }}
          >
            {loadingEnvironment ? "Checking..." : environment}
          </div>
          <div style={heroNote}>
            {isStaging
              ? "This workspace can export promotion packages for production."
              : isProduction
                ? "This workspace can import approved promotion packages from staging."
                : "Environment label is not resolved clearly yet. Please verify deployment settings."}
          </div>
        </div>
      </div>

      <div style={grid}>
        <div style={card}>
          <div style={cardTitle}>Staging Export</div>
          <div style={cardText}>
            Generate a promotion package containing the client workspace setup, partner master, profile, connections, mapping profiles, business rules, UOM rules, address master, message flows, parser profiles, and notifications.
          </div>
          <button
            type="button"
            style={{ ...primaryButton, opacity: isStaging ? 1 : 0.5, cursor: isStaging ? "pointer" : "not-allowed" }}
            onClick={downloadPackage}
            disabled={!isStaging || busy}
          >
            {busy && isStaging ? "Preparing Package..." : "Download Promotion Package"}
          </button>
        </div>

        <div style={card}>
          <div style={cardTitle}>Production Import</div>
          <div style={cardText}>
            Import a promotion package that was exported from staging. The import action is logged and auditable so production changes remain controlled.
          </div>
          <label
            style={{
              ...secondaryButton,
              opacity: isProduction ? 1 : 0.5,
              cursor: isProduction ? "pointer" : "not-allowed",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {busy && isProduction ? "Importing..." : "Import Promotion Package"}
            <input
              type="file"
              accept=".json"
              style={{ display: "none" }}
              disabled={!isProduction || busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void importPackage(file);
                }
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {preview ? (
        <div style={noteCard}>
          <div style={cardTitle}>Package Preview</div>
          <div style={historyMetaGrid}>
            <div><strong>Partner</strong><div>{preview.partnerCode} - {preview.partnerName}</div></div>
            <div><strong>Version</strong><div>{preview.version}</div></div>
            <div><strong>Source</strong><div>{preview.sourceEnvironment}</div></div>
            <div><strong>Target</strong><div>{preview.targetEnvironment}</div></div>
          </div>
          <div style={{ ...cardText, marginTop: 10 }}>
            Domains: {preview.domains.length ? preview.domains.join(", ") : "None"}
          </div>
          <div style={historyList}>
            {Object.entries(preview.counts || {}).map(([key, value]) => (
              <div key={key} style={historyItem}>
                <strong>{key}</strong>
                <span>{String(value ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={noteCard}>
        <div style={cardTitle}>Promotion History</div>
        {loadingHistory ? <div style={cardText}>Loading promotion history...</div> : history.length === 0 ? <div style={cardText}>No promotion exports or imports recorded for this partner yet.</div> : <div style={historyList}>{history.map((row) => <div key={row.audit_id} style={historyItem}><div><strong>{row.action}</strong><div style={historySub}>{row.created_at || "-"}</div><div style={historySub}>{row.remarks || "Promotion event"}</div></div><div style={historySub}>{row.actor_email || "system"}</div></div>)}</div>}
      </div>

      <div style={noteCard}>
        <div style={cardTitle}>Audit and Separation</div>
        <ul style={list}>
          <li>Export from staging writes a promotion audit entry with package counts and config domains.</li>
          <li>Import into production validates the package and writes a production-side promotion audit entry.</li>
          <li>No direct in-place cross-environment mutation happens inside one workspace.</li>
          <li>The promotion package acts as the controlled handoff between separate environments.</li>
        </ul>
      </div>
    </div>
  );
}

const title: React.CSSProperties = { fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 8 };
const subTitle: React.CSSProperties = { fontSize: 13, color: "#64748b", marginBottom: 14, lineHeight: 1.6 };
const heroCard: React.CSSProperties = { border: "1px solid #dbe4ee", borderRadius: 14, background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)", padding: 16, marginBottom: 14 };
const heroMeta: React.CSSProperties = { display: "grid", gap: 6 };
const heroLabel: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 };
const heroValue: React.CSSProperties = { fontSize: 24, fontWeight: 900 };
const heroNote: React.CSSProperties = { fontSize: 13, color: "#475569", lineHeight: 1.6 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 };
const card: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", padding: 14, display: "grid", gap: 10 };
const cardTitle: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: "#0f172a" };
const cardText: React.CSSProperties = { fontSize: 13, color: "#64748b", lineHeight: 1.6 };
const primaryButton: React.CSSProperties = { border: "1px solid #0b5fff", background: "#0b5fff", color: "#fff", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 700 };
const secondaryButton: React.CSSProperties = { border: "1px solid #dbe4ee", background: "#fff", color: "#0f172a", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 700 };
const noteCard: React.CSSProperties = { marginTop: 14, border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", padding: 14 };
const list: React.CSSProperties = { margin: 0, paddingLeft: 18, color: "#475569", lineHeight: 1.7, fontSize: 13 };

const historyMetaGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, fontSize: 13, color: "#475569" };
const historyList: React.CSSProperties = { display: "grid", gap: 10, marginTop: 12 };
const historyItem: React.CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, border: "1px solid #eef2f7", borderRadius: 10, padding: "10px 12px", background: "#f8fafc", fontSize: 13, color: "#0f172a" };
const historySub: React.CSSProperties = { fontSize: 12, color: "#64748b", marginTop: 2 };
