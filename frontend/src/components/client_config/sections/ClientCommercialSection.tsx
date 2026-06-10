import { useEffect, useMemo, useState } from "react";
import { apiFetch, parseApiError } from "../../../utils/api";

const API_BASE = "/client-config";

type Props = {
  client: { client_id: string; client_name: string } | null;
  environment: string;
  readOnly?: boolean;
  onBanner: (text: string, type?: "success" | "error" | "info") => void;
};

type CommercialSettings = {
  source_mode: string;
  erp_sync_enabled: boolean;
  erp_sync_frequency: string;
  erp_last_sync_at: string | null;
  currency_mode: string;
  fallback_policy: string;
  checkout_priority: string[];
  charge_codes: any[];
  jurisdiction_rules: any[];
  buyer_terms: any[];
  product_mapping: any[];
};

const defaultSettings: CommercialSettings = {
  source_mode: "ORDANEX_MASTER",
  erp_sync_enabled: false,
  erp_sync_frequency: "DAILY",
  erp_last_sync_at: null,
  currency_mode: "CLIENT_DEFAULT",
  fallback_policy: "ZERO_FALLBACK",
  checkout_priority: [
    "Buyer-specific ERP contract",
    "Ship-to jurisdiction ERP rule",
    "Product ERP mapping",
    "Ordanex storefront override",
    "Ordanex client default",
    "Zero fallback",
  ],
  charge_codes: [],
  jurisdiction_rules: [],
  buyer_terms: [],
  product_mapping: [],
};

function normalizeJsonArray(value: string, label: string) {
  const text = value.trim();
  if (!text) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array.`);
  return parsed;
}

export default function ClientCommercialSection({ client, environment, readOnly = false, onBanner }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [form, setForm] = useState({
    source_mode: defaultSettings.source_mode,
    erp_sync_enabled: defaultSettings.erp_sync_enabled ? "YES" : "NO",
    erp_sync_frequency: defaultSettings.erp_sync_frequency,
    erp_last_sync_at: defaultSettings.erp_last_sync_at || "",
    currency_mode: defaultSettings.currency_mode,
    fallback_policy: defaultSettings.fallback_policy,
    checkout_priority_json: JSON.stringify(defaultSettings.checkout_priority, null, 2),
    charge_codes_json: JSON.stringify(defaultSettings.charge_codes, null, 2),
    jurisdiction_rules_json: JSON.stringify(defaultSettings.jurisdiction_rules, null, 2),
    buyer_terms_json: JSON.stringify(defaultSettings.buyer_terms, null, 2),
    product_mapping_json: JSON.stringify(defaultSettings.product_mapping, null, 2),
  });

  const envQuery = useMemo(() => new URLSearchParams({ environment }).toString(), [environment]);
  const isProduction = String(environment || "PROD").toUpperCase() === "PROD";

  useEffect(() => {
    if (!client?.client_id) return;
    void load();
  }, [client?.client_id, envQuery]);

  async function load() {
    if (!client?.client_id) return;
    try {
      setLoading(true);
      const res = await apiFetch(`${API_BASE}/client-commercial-settings/${client.client_id}?${envQuery}`);
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      const settings = { ...defaultSettings, ...(data?.settings || {}) } as CommercialSettings;
      setForm({
        source_mode: settings.source_mode || defaultSettings.source_mode,
        erp_sync_enabled: settings.erp_sync_enabled ? "YES" : "NO",
        erp_sync_frequency: settings.erp_sync_frequency || defaultSettings.erp_sync_frequency,
        erp_last_sync_at: settings.erp_last_sync_at || "",
        currency_mode: settings.currency_mode || defaultSettings.currency_mode,
        fallback_policy: settings.fallback_policy || defaultSettings.fallback_policy,
        checkout_priority_json: JSON.stringify(Array.isArray(settings.checkout_priority) ? settings.checkout_priority : defaultSettings.checkout_priority, null, 2),
        charge_codes_json: JSON.stringify(Array.isArray(settings.charge_codes) ? settings.charge_codes : [], null, 2),
        jurisdiction_rules_json: JSON.stringify(Array.isArray(settings.jurisdiction_rules) ? settings.jurisdiction_rules : [], null, 2),
        buyer_terms_json: JSON.stringify(Array.isArray(settings.buyer_terms) ? settings.buyer_terms : [], null, 2),
        product_mapping_json: JSON.stringify(Array.isArray(settings.product_mapping) ? settings.product_mapping : [], null, 2),
      });
    } catch (err: any) {
      onBanner(err?.message || "Failed to load commercial settings.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!client?.client_id) return;
    try {
      setSaving(true);
      const payload = {
        source_mode: form.source_mode,
        erp_sync_enabled: form.erp_sync_enabled === "YES",
        erp_sync_frequency: form.erp_sync_frequency,
        erp_last_sync_at: form.erp_last_sync_at || null,
        currency_mode: form.currency_mode,
        fallback_policy: form.fallback_policy,
        checkout_priority: normalizeJsonArray(form.checkout_priority_json, "Checkout priority"),
        charge_codes: normalizeJsonArray(form.charge_codes_json, "Charge codes"),
        jurisdiction_rules: normalizeJsonArray(form.jurisdiction_rules_json, "Jurisdiction rules"),
        buyer_terms: normalizeJsonArray(form.buyer_terms_json, "Buyer commercial terms"),
        product_mapping: normalizeJsonArray(form.product_mapping_json, "Product commercial mapping"),
      };
      const res = await apiFetch(`${API_BASE}/client-commercial-settings/${client.client_id}?${envQuery}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      await load();
      onBanner("Commercial settings saved.", "success");
    } catch (err: any) {
      onBanner(err?.message || "Failed to save commercial settings.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!client?.client_id) return;
    try {
      setPublishing(true);
      const res = await apiFetch(`${API_BASE}/client-commercial-settings/${client.client_id}/publish?from_environment=STAGING&to_environment=PROD`, { method: "POST" });
      if (!res.ok) throw new Error(await parseApiError(res));
      onBanner("Commercial settings published to Production.", "success");
    } catch (err: any) {
      onBanner(err?.message || "Failed to publish commercial settings.", "error");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div>
      <div style={headerRow}>
        <div>
          <div style={title}>Commercial Rules</div>
          <div style={subtitle}>Manage commercial source ownership, ERP sync cadence, charge codes, jurisdiction rules, buyer terms, and checkout precedence independently from storefront catalog content.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!isProduction ? (
            <>
              <button type="button" onClick={publish} disabled={publishing || saving || loading} style={button}>
                {publishing ? "Publishing..." : "Publish to production"}
              </button>
              <button type="button" onClick={save} disabled={saving || loading} style={buttonPrimary}>
                {saving ? "Saving..." : "Save commercial settings"}
              </button>
            </>
          ) : (
            <button type="button" disabled style={buttonPrimary}>Production is read-only</button>
          )}
        </div>
      </div>

      <div style={callout}>
        <strong>Recommended operating model:</strong> ERP-connected clients should normally use <code>ERP_MASTER</code> or <code>HYBRID</code>. Storefront-only or non-ERP suppliers should use <code>ORDANEX_MASTER</code>.
      </div>

      {readOnly ? <div style={readOnlyBanner}>Production is read-only for commercial governance. Use Staging to prepare changes, then publish them to Production.</div> : null}

      <fieldset style={fieldsetStyle} disabled={readOnly || loading}>
        <div style={grid2}>
          {field("Commercial Source Model", <select value={form.source_mode} onChange={(e) => setForm((prev) => ({ ...prev, source_mode: e.target.value }))} style={inputStyle}><option value="ERP_MASTER">ERP_MASTER</option><option value="ORDANEX_MASTER">ORDANEX_MASTER</option><option value="HYBRID">HYBRID</option></select>)}
          {field("ERP Sync Enabled", <select value={form.erp_sync_enabled} onChange={(e) => setForm((prev) => ({ ...prev, erp_sync_enabled: e.target.value }))} style={inputStyle}><option value="YES">YES</option><option value="NO">NO</option></select>)}
          {field("ERP Sync Frequency", <select value={form.erp_sync_frequency} onChange={(e) => setForm((prev) => ({ ...prev, erp_sync_frequency: e.target.value }))} style={inputStyle}><option value="MANUAL">MANUAL</option><option value="HOURLY">HOURLY</option><option value="DAILY">DAILY</option><option value="WEEKLY">WEEKLY</option></select>)}
          {field("ERP Last Sync At", <input value={form.erp_last_sync_at} onChange={(e) => setForm((prev) => ({ ...prev, erp_last_sync_at: e.target.value }))} style={inputStyle} placeholder="ISO timestamp or leave blank" />)}
          {field("Currency Mode", <select value={form.currency_mode} onChange={(e) => setForm((prev) => ({ ...prev, currency_mode: e.target.value }))} style={inputStyle}><option value="CLIENT_DEFAULT">CLIENT_DEFAULT</option><option value="ERP_DEFAULT">ERP_DEFAULT</option><option value="BUYER_CONTEXT">BUYER_CONTEXT</option></select>)}
          {field("Fallback Policy", <select value={form.fallback_policy} onChange={(e) => setForm((prev) => ({ ...prev, fallback_policy: e.target.value }))} style={inputStyle}><option value="ZERO_FALLBACK">ZERO_FALLBACK</option><option value="CLIENT_DEFAULTS">CLIENT_DEFAULTS</option><option value="STORE_FRONT_OVERLAY">STORE_FRONT_OVERLAY</option></select>)}
        </div>

        <div style={editorGrid}>
          {bigField("Checkout Priority / Fallback", "Resolution order used during checkout and order snapshot creation.", form.checkout_priority_json, (value) => setForm((prev) => ({ ...prev, checkout_priority_json: value })))}
          {bigField("Charge Codes", "Normalized charge definitions such as TAX, FREIGHT, SHIPPING, OCTROI, and DISCOUNT.", form.charge_codes_json, (value) => setForm((prev) => ({ ...prev, charge_codes_json: value })))}
          {bigField("Jurisdiction Rules", "Country, state, postal, buyer-group, sold-to, ship-to, and charge override rules.", form.jurisdiction_rules_json, (value) => setForm((prev) => ({ ...prev, jurisdiction_rules_json: value })))}
          {bigField("Buyer Commercial Terms", "Buyer-specific payment terms, discount programs, exemption codes, and credit rules.", form.buyer_terms_json, (value) => setForm((prev) => ({ ...prev, buyer_terms_json: value })))}
          {bigField("Product Commercial Mapping", "SKU-level default charge-code mapping for tax, freight, shipping, octroi, and discount references.", form.product_mapping_json, (value) => setForm((prev) => ({ ...prev, product_mapping_json: value })))}
        </div>
      </fieldset>
    </div>
  );
}

function field(label: string, child: React.ReactNode) {
  return <div><div style={labelStyle}>{label}</div>{child}</div>;
}

function bigField(label: string, helper: string, value: string, onChange: (value: string) => void) {
  return (
    <div style={card}>
      <div style={cardTitle}>{label}</div>
      <div style={cardHelper}>{helper}</div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} style={textAreaStyle} spellCheck={false} />
    </div>
  );
}

const headerRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16, flexWrap: "wrap" };
const title: React.CSSProperties = { fontSize: 18, fontWeight: 800, color: "#0f172a" };
const subtitle: React.CSSProperties = { fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 1.6 };
const callout: React.CSSProperties = { marginBottom: 14, border: "1px solid #dbeafe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 10, padding: "12px 14px", fontSize: 12, lineHeight: 1.7 };
const readOnlyBanner: React.CSSProperties = { marginBottom: 14, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 600 };
const fieldsetStyle: React.CSSProperties = { border: 0, padding: 0, margin: 0, minInlineSize: 0 };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14, marginBottom: 16 };
const editorGrid: React.CSSProperties = { display: "grid", gap: 14 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: "100%", minHeight: 40, padding: "8px 10px", borderRadius: 10, border: "1px solid #dbe4ee", background: "#fff", fontSize: 13, color: "#0f172a", outline: "none", boxSizing: "border-box" };
const textAreaStyle: React.CSSProperties = { width: "100%", minHeight: 180, padding: "10px 12px", borderRadius: 12, border: "1px solid #dbe4ee", background: "#fff", fontSize: 12, color: "#0f172a", lineHeight: 1.6, resize: "vertical", boxSizing: "border-box", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" };
const card: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", padding: 16 };
const cardTitle: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: "#0f172a" };
const cardHelper: React.CSSProperties = { fontSize: 12, color: "#64748b", marginTop: 4, marginBottom: 10, lineHeight: 1.6 };
const button: React.CSSProperties = { border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontWeight: 700, fontSize: 12 };
const buttonPrimary: React.CSSProperties = { border: "1px solid #0b5fff", background: "#0b5fff", color: "#fff", borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontWeight: 700, fontSize: 12 };
