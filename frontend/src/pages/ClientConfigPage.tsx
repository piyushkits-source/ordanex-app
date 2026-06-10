import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/common/PageHeader";
import { apiFetch, parseApiError } from "../utils/api";
import { useAppScope } from "../context/AppScopeContext";
import { buildStorefrontPath, storefrontEnvironmentSlug } from "../utils/environment";

const API = "/client-config";


function normalizeApprovedBuyerEmails(value: any) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(
    new Set(
      value
        .map((item) => String((typeof item === "string" ? item : item?.email) || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function buildSyncHealth(connections: any[], erpConfigs: any[], syncEvents: any[]) {
  const normalize = (value: unknown) => String(value || "").trim().toUpperCase();
  const families = [
    { key: "UOM", label: "UOM Sync" },
    { key: "ADDRESS", label: "Address Sync" },
  ];

  return families.map((family) => {
    const connection = connections.find(
      (row) =>
        normalize(row?.config_json?.sync_object) === family.key ||
        normalize(row?.message_type) === `${family.key}_SYNC`
    );
    const erp = erpConfigs.filter((row) => normalize(row?.message_type).includes(family.key));
    const latestEvent = [...(syncEvents || [])]
      .filter((row) => normalize(row?.sync_key) === family.key)
      .sort((left, right) => String(right?.created_at || "").localeCompare(String(left?.created_at || "")))[0];
    const ready = Boolean(connection?.is_active) && erp.length > 0;

    return {
      key: family.key,
      label: family.label,
      status: latestEvent?.status || (ready ? "READY" : connection ? "CONFIGURED" : "NOT CONFIGURED"),
      connection,
      erp,
      latestEvent,
      endpoint:
        latestEvent?.endpoint_url ||
        connection?.config_json?.endpoint_url ||
        connection?.config_json?.webhook_url ||
        connection?.config_json?.endpoint ||
        "-",
      syncMode: connection?.config_json?.sync_mode || "-",
      direction: connection?.direction || "-",
      lastSyncedAt: latestEvent?.last_synced_at || latestEvent?.created_at || "-",
      recordsSynced: latestEvent?.records_synced ?? 0,
      message: latestEvent?.message || (ready ? "Configuration ready" : "Awaiting setup"),
      eventType: latestEvent?.event_type || "-",
    };
  });
}

export default function ClientConfigPage() {
  const { scope } = useAppScope();
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any>(null);

  const [verticals, setVerticals] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [erpConfigs, setErpConfigs] = useState<any[]>([]);
  const [syncEvents, setSyncEvents] = useState<any[]>([]);
  const [buyerStorefront, setBuyerStorefront] = useState<any>(null);
  const [buyerStorefrontLoading, setBuyerStorefrontLoading] = useState(false);
  const [buyerStorefrontSaving, setBuyerStorefrontSaving] = useState(false);
  const [storefrontSettings, setStorefrontSettings] = useState<any>(null);
  const [storefrontSettingsLoading, setStorefrontSettingsLoading] = useState(false);
  const [storefrontSettingsSaving, setStorefrontSettingsSaving] = useState(false);
  const [catalogSyncing, setCatalogSyncing] = useState(false);
  const [catalogSyncMessage, setCatalogSyncMessage] = useState<string | null>(null);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [approvedBuyerEmails, setApprovedBuyerEmails] = useState<string[]>([]);
  const [approvedBuyerDraft, setApprovedBuyerDraft] = useState("");
  const [storefrontForm, setStorefrontForm] = useState({
    storefront_title: "Buyer Portal",
    hero_headline: "Shop products, submit orders, and track ERP status in one storefront.",
    hero_description: "Configure the look and feel of the buyer experience, keep the catalog aligned to the client portfolio, and let Ordanex create the downstream PO and ERP order flow automatically.",
    support_email: "hello@ordanex.ai",
    logo_url: "",
    accent_color: "#2563eb",
    banner_text: "",
    catalog_source_mode: "ERP_SYNCED",
    catalog_title: "Client Catalog",
    catalog_description: "Manage products, categories, pricing, and item visibility for the storefront.",
    catalog_json: "[]",
  });

  const [activeTab, setActiveTab] = useState("VERTICAL");
  const syncHealth = useMemo(() => buildSyncHealth(connections, erpConfigs, syncEvents), [connections, erpConfigs, syncEvents]);

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      loadAll(selectedClient.client_id);
      void loadBuyerStorefront(selectedClient.client_id);
      void loadBuyerStorefrontSettings(selectedClient.client_id);
    }
  }, [selectedClient]);

  useEffect(() => {
    if (storefrontForm.catalog_source_mode !== "PLATFORM_MANAGED") return;
    const nextJson = JSON.stringify(catalogItems, null, 2);
    setStorefrontForm((prev) => (prev.catalog_json === nextJson ? prev : { ...prev, catalog_json: nextJson }));
  }, [catalogItems, storefrontForm.catalog_source_mode]);

  async function loadClients() {
    const res = await apiFetch(`${API}/clients`);
    setClients(await res.json());
  }

  async function loadAll(clientId: string) {
    const [v, c, e, s] = await Promise.all([
      apiFetch(`${API}/verticals/${clientId}`),
      apiFetch(`${API}/connections/${clientId}`),
      apiFetch(`${API}/erp/${clientId}`),
      apiFetch(`${API}/sync-events/${clientId}`),
    ]);

    setVerticals(await v.json());
    setConnections(await c.json());
    setErpConfigs(await e.json());
    setSyncEvents(await s.json());
  }

  async function loadBuyerStorefront(clientId: string) {
    try {
      setBuyerStorefrontLoading(true);
      const res = await apiFetch(`${API}/buyer-storefront/${clientId}`);
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      setBuyerStorefront(await res.json());
    } catch (err: any) {
      setBuyerStorefront(null);
      console.error(err);
    } finally {
      setBuyerStorefrontLoading(false);
    }
  }

  async function loadBuyerStorefrontSettings(clientId: string) {
    try {
      setStorefrontSettingsLoading(true);
      const res = await apiFetch(`${API}/buyer-storefront-settings/${clientId}`);
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      const data = await res.json();
      const settings = data?.settings || {};
      setStorefrontSettings(settings);
      const branding = settings.branding || {};
      const catalog = settings.catalog || {};
      const access = settings.access || {};
      setApprovedBuyerEmails(normalizeApprovedBuyerEmails(access.approved_buyers));
      setApprovedBuyerDraft("");
      setStorefrontForm({
        storefront_title: branding.storefront_title || "Buyer Portal",
        hero_headline: branding.hero_headline || "Shop products, submit orders, and track ERP status in one storefront.",
        hero_description: branding.hero_description || "Configure the look and feel of the buyer experience, keep the catalog aligned to the client portfolio, and let Ordanex create the downstream PO and ERP order flow automatically.",
        support_email: branding.support_email || "hello@ordanex.ai",
        logo_url: branding.logo_url || "",
        accent_color: branding.accent_color || "#2563eb",
        banner_text: branding.banner_text || "",
        catalog_source_mode: String(catalog.source_mode || "ERP_SYNCED"),
        catalog_title: catalog.title || "Client Catalog",
        catalog_description: catalog.description || "Manage products, categories, pricing, and item visibility for the storefront.",
        catalog_json: JSON.stringify(catalog.items || [], null, 2),
      });
      setCatalogItems(Array.isArray(catalog.items) ? catalog.items : []);
    } catch (err: any) {
      console.error(err);
      setStorefrontSettings(null);
    } finally {
      setStorefrontSettingsLoading(false);
    }
  }

  function openBuyerStorefront() {
    if (!selectedClient?.client_id) return;
    const url = buildStorefrontPath(selectedClient.client_id, scope.environment || "PROD");
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function saveBuyerStorefront(enabled: boolean) {
    if (!selectedClient) return;
    try {
      setBuyerStorefrontSaving(true);
      const res = await apiFetch(`${API}/buyer-storefront/${selectedClient.client_id}`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      setBuyerStorefront(await res.json());
      await loadClients();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Failed to update buyer storefront access.");
    } finally {
      setBuyerStorefrontSaving(false);
    }
  }

  function addApprovedBuyer() {
    const email = approvedBuyerDraft.trim().toLowerCase();
    if (!email) return;
    setApprovedBuyerEmails((current) => (current.includes(email) ? current : [...current, email]));
    setApprovedBuyerDraft("");
  }

  function removeApprovedBuyer(email: string) {
    setApprovedBuyerEmails((current) => current.filter((item) => item !== email));
  }

  async function syncBuyerStorefrontCatalog() {
    if (!selectedClient) return;
    try {
      setCatalogSyncing(true);
      setCatalogSyncMessage(null);
      const res = await apiFetch(`${API}/buyer-storefront-catalog-sync/${selectedClient.client_id}`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      const data = await res.json();
      setStorefrontSettings(data.settings || {});
      const catalog = data?.settings?.catalog || {};
      setCatalogItems(Array.isArray(catalog.items) ? catalog.items : []);
      setCatalogSyncMessage(`Catalog synced from ${data?.source_system || "ERP"} (${data?.records_synced || 0} items).`);
      await loadBuyerStorefrontSettings(selectedClient.client_id);
    } catch (err: any) {
      console.error(err);
      setCatalogSyncMessage(err?.message || "Failed to sync catalog from ERP.");
    } finally {
      setCatalogSyncing(false);
    }
  }

  function exportCatalogCsv() {
    const headers = ["sku", "name", "category", "unit_price", "currency", "uom", "stock_status", "lead_time", "description"];
    const escapeCsv = (value: any) => {
      const normalized = value == null ? "" : String(value);
      return `"${normalized.replace(/"/g, '""')}"`;
    };
    const rows = [headers, ...catalogItems.map((item) => headers.map((key) => escapeCsv((item as any)[key])) )];
    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(storefrontForm.catalog_title || selectedClient?.client_name || "catalog").replace(/[^a-z0-9-_]+/gi, "_").toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  async function importCatalogCsv(file: File) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (!lines.length) return [];
    const parseLine = (line: string) => {
      const cells: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const next = line[i + 1];
        if (char === '"' && inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          cells.push(current);
          current = "";
        } else {
          current += char;
        }
      }
      cells.push(current);
      return cells.map((cell) => cell.trim());
    };
    const headers = parseLine(lines[0]).map((header) => header.trim().toLowerCase());
    const parsed = lines.slice(1).map((line) => {
      const values = parseLine(line);
      const row: Record<string, any> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });
      return {
        sku: row.sku || "",
        name: row.name || "",
        category: row.category || "",
        unit_price: row.unit_price ? Number(row.unit_price) : 0,
        currency: row.currency || "USD",
        uom: row.uom || "EA",
        stock_status: row.stock_status || "Available",
        lead_time: row.lead_time || "",
        description: row.description || "",
      };
    });
    return parsed;
  }

  async function saveBuyerStorefrontSettings() {
    if (!selectedClient) return;
    try {
      setStorefrontSettingsSaving(true);
      let parsedCatalog: any[] = [];
      try {
        parsedCatalog =
          storefrontForm.catalog_source_mode === "PLATFORM_MANAGED"
            ? catalogItems
            : storefrontForm.catalog_json.trim()
              ? JSON.parse(storefrontForm.catalog_json)
              : [];
      } catch {
        throw new Error("Catalog JSON must be valid JSON.");
      }
      const payload = {
        branding: {
          storefront_title: storefrontForm.storefront_title,
          hero_headline: storefrontForm.hero_headline,
          hero_description: storefrontForm.hero_description,
          support_email: storefrontForm.support_email,
          logo_url: storefrontForm.logo_url,
          accent_color: storefrontForm.accent_color,
          banner_text: storefrontForm.banner_text,
        },
        catalog: {
          source_mode: storefrontForm.catalog_source_mode,
          title: storefrontForm.catalog_title,
          description: storefrontForm.catalog_description,
          items: parsedCatalog,
        },
        access: {
          approval_mode: "EMAIL_APPROVAL",
          approved_buyers: approvedBuyerEmails.map((email) => ({ email })),
        },
      };
      const res = await apiFetch(`${API}/buyer-storefront-settings/${selectedClient.client_id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      const data = await res.json();
      setStorefrontSettings(data.settings || {});
      await loadBuyerStorefrontSettings(selectedClient.client_id);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Failed to save storefront settings.");
    } finally {
      setStorefrontSettingsSaving(false);
    }
  }


  return (
    <div>
      <PageHeader title="Client Configuration" />

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>

        {/* LEFT PANEL */}
        <div style={card}>
          <div style={header}>Clients</div>

          {clients.map((c) => (
            <div
              key={c.client_id}
              onClick={() => setSelectedClient(c)}
              style={{
                padding: 10,
                cursor: "pointer",
                border:
                  selectedClient?.client_id === c.client_id
                    ? "1px solid #2563eb"
                    : "1px solid #e5e7eb",
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              {c.client_name}
            </div>
          ))}
        </div>

        {/* RIGHT PANEL */}
        <div style={card}>
          {!selectedClient ? (
            <div>Select a client</div>
          ) : (
            <>
              <div style={header}>
                {selectedClient.client_name}
              </div>

              <div style={featurePanel}>
                <div style={syncPanelHeader}>
                  <div>
                    <div style={syncPanelTitle}>Storefront Setup</div>
                    <div style={syncPanelSubtitle}>Enable the buyer storefront, brand the experience, choose the catalog source, and approve the buyers who can access it.</div>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={openBuyerStorefront}
                      disabled={!selectedClient}
                      style={toggleButton}
                    >
                      Open storefront
                    </button>
                    <button
                      onClick={saveBuyerStorefrontSettings}
                      disabled={!selectedClient || storefrontSettingsSaving}
                      style={toggleButton}
                    >
                      {storefrontSettingsSaving ? "Saving..." : "Save storefront settings"}
                    </button>
                  </div>
                </div>
                <div style={storefrontSetupGrid}>
                  {[
                    {
                      title: "1. Enable access",
                      copy: "Turn the storefront on for the client. Premium and Enterprise can still be disabled or re-enabled per client.",
                    },
                    {
                      title: "2. Choose catalog source",
                      copy: "Use ERP-synced for a live client ERP catalog, or platform-managed for smaller suppliers who edit products directly in Ordanex.",
                    },
                    {
                      title: "3. Approve buyers",
                      copy: "Add only the buyer email addresses that should be allowed to open the storefront and place orders.",
                    },
                    {
                      title: "4. Open and share",
                      copy: "Open the storefront path and share it with the approved buyer group once the setup is saved.",
                    },
                  ].map((step) => (
                    <div key={step.title} style={storefrontSetupStep}>
                      <div style={storefrontSetupStepTitle}>{step.title}</div>
                      <div style={storefrontSetupStepCopy}>{step.copy}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={featurePanel}>
                <div style={syncPanelHeader}>
                  <div>
                    <div style={syncPanelTitle}>Buyer Storefront Access</div>
                    <div style={syncPanelSubtitle}>Premium and Enterprise include this by default, but you can disable or re-enable it per client here.</div>
                  </div>
                  <button
                    onClick={() => saveBuyerStorefront(!Boolean(buyerStorefront?.enabled))}
                    disabled={!selectedClient || buyerStorefrontSaving}
                    style={toggleButton}
                  >
                    {buyerStorefrontSaving ? "Saving..." : Boolean(buyerStorefront?.enabled) ? "Disable storefront" : "Enable storefront"}
                  </button>
                </div>
                <div style={featureMetaGrid}>
                  <div style={featureMetaCard}>
                    <div style={featureMetaLabel}>Effective access</div>
                    <div style={featureMetaValue}>{buyerStorefrontLoading ? "Loading..." : Boolean(buyerStorefront?.enabled) ? "Enabled" : "Disabled"}</div>
                  </div>
                  <div style={featureMetaCard}>
                    <div style={featureMetaLabel}>Source</div>
                    <div style={featureMetaValue}>{buyerStorefront?.source || "none"}</div>
                  </div>
                  <div style={featureMetaCard}>
                    <div style={featureMetaLabel}>Subscription</div>
                    <div style={featureMetaValue}>{buyerStorefront?.subscription_type || selectedClient?.subscription_type || "BASIC"}</div>
                  </div>
                </div>
              </div>

              <div style={featurePanel}>
                <div style={syncPanelHeader}>
                  <div>
                    <div style={syncPanelTitle}>Storefront Configuration</div>
                    <div style={syncPanelSubtitle}>Client admins can brand the storefront and manage the published catalog directly from this GUI.</div>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={openBuyerStorefront}
                      disabled={!selectedClient}
                      style={toggleButton}
                    >
                      Open storefront
                    </button>
                    <button
                      onClick={saveBuyerStorefrontSettings}
                      disabled={!selectedClient || storefrontSettingsSaving}
                      style={toggleButton}
                    >
                      {storefrontSettingsSaving ? "Saving..." : "Save storefront settings"}
                    </button>
                  </div>
                </div>
                <div style={featureMetaGrid}>
                  <div style={featureMetaCard}>
                    <div style={featureMetaLabel}>Storefront title</div>
                    <input
                      style={{ ...field, marginTop: 6 }}
                      value={storefrontForm.storefront_title}
                      onChange={(e) => setStorefrontForm((prev) => ({ ...prev, storefront_title: e.target.value }))}
                      placeholder="Buyer Portal"
                    />
                  </div>
                  <div style={featureMetaCard}>
                    <div style={featureMetaLabel}>Accent color</div>
                    <input
                      style={{ ...field, marginTop: 6 }}
                      value={storefrontForm.accent_color}
                      onChange={(e) => setStorefrontForm((prev) => ({ ...prev, accent_color: e.target.value }))}
                      placeholder="#2563eb"
                    />
                  </div>
                  <div style={featureMetaCard}>
                    <div style={featureMetaLabel}>Support email</div>
                    <input
                      style={{ ...field, marginTop: 6 }}
                      value={storefrontForm.support_email}
                      onChange={(e) => setStorefrontForm((prev) => ({ ...prev, support_email: e.target.value }))}
                      placeholder="hello@ordanex.ai"
                    />
                  </div>
                  <div style={featureMetaCard}>
                    <div style={featureMetaLabel}>Logo URL</div>
                    <input
                      style={{ ...field, marginTop: 6 }}
                      value={storefrontForm.logo_url}
                      onChange={(e) => setStorefrontForm((prev) => ({ ...prev, logo_url: e.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                  <div style={featureMetaCard}>
                    <div style={featureMetaLabel}>Hero headline</div>
                    <textarea
                      style={{ ...field, marginTop: 6, minHeight: 84, resize: "vertical" }}
                      value={storefrontForm.hero_headline}
                      onChange={(e) => setStorefrontForm((prev) => ({ ...prev, hero_headline: e.target.value }))}
                    />
                  </div>
                  <div style={featureMetaCard}>
                    <div style={featureMetaLabel}>Hero description</div>
                    <textarea
                      style={{ ...field, marginTop: 6, minHeight: 84, resize: "vertical" }}
                      value={storefrontForm.hero_description}
                      onChange={(e) => setStorefrontForm((prev) => ({ ...prev, hero_description: e.target.value }))}
                    />
                  </div>
                  <div style={{ ...featureMetaCard, gridColumn: "1 / -1" }}>
                    <div style={featureMetaLabel}>Catalog source</div>
                    <select
                      style={{ ...field, marginTop: 6 }}
                      value={storefrontForm.catalog_source_mode}
                      onChange={(e) => setStorefrontForm((prev) => ({ ...prev, catalog_source_mode: e.target.value }))}
                    >
                      <option value="ERP_SYNCED">ERP-synced catalog</option>
                      <option value="PLATFORM_MANAGED">Platform-managed catalog</option>
                    </select>
                    <div style={{ marginTop: 6, fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
                      ERP-synced keeps the catalog aligned with the client's ERP. Platform-managed lets small suppliers maintain products directly in Ordanex.
                    </div>
                  </div>
                  <div style={{ ...featureMetaCard, gridColumn: "1 / -1" }}>
                    <div style={featureMetaLabel}>Catalog title and description</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 10, marginTop: 6 }}>
                      <input
                        style={field}
                        value={storefrontForm.catalog_title}
                        onChange={(e) => setStorefrontForm((prev) => ({ ...prev, catalog_title: e.target.value }))}
                        placeholder="Client Catalog"
                      />
                      <input
                        style={field}
                        value={storefrontForm.catalog_description}
                        onChange={(e) => setStorefrontForm((prev) => ({ ...prev, catalog_description: e.target.value }))}
                        placeholder="Description shown above the catalog"
                      />
                    </div>
                  </div>
                  {storefrontForm.catalog_source_mode === "ERP_SYNCED" ? (
                    <div style={{ ...featureMetaCard, gridColumn: "1 / -1" }}>
                      <div style={featureMetaLabel}>ERP catalog sync</div>
                      <div style={{ marginTop: 6, fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
                        Refresh the catalog from the connected ERP-side configuration. This keeps the storefront aligned with the client's master data.
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                        <button
                          type="button"
                          onClick={syncBuyerStorefrontCatalog}
                          disabled={!selectedClient || catalogSyncing}
                          style={toggleButton}
                        >
                          {catalogSyncing ? "Syncing..." : "Sync catalog from ERP"}
                        </button>
                        <div style={{ fontSize: 12, color: "#475569" }}>{catalogSyncMessage || storefrontSettings?.catalog?.sync_note || "Ready to sync."}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ ...featureMetaCard, gridColumn: "1 / -1" }}>
                      <div style={featureMetaLabel}>Platform catalog editor</div>
                      <div style={{ marginTop: 6, fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
                        Maintain products directly in Ordanex. Changes here become the published buyer catalog for smaller suppliers.
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                        <button type="button" onClick={exportCatalogCsv} style={toggleButton}>
                          Export CSV
                        </button>
                        <button type="button" onClick={() => catalogImportRef.current?.click()} style={toggleButton}>
                          Import CSV
                        </button>
                        <input
                          ref={catalogImportRef}
                          type="file"
                          accept=".csv,text/csv"
                          style={{ display: "none" }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const imported = await importCatalogCsv(file);
                              setCatalogItems(imported);
                              setCatalogSyncMessage(`Imported ${imported.length} catalog rows from CSV.`);
                            } catch (error: any) {
                              alert(error?.message || "Failed to import CSV.");
                            } finally {
                              e.target.value = "";
                            }
                          }}
                        />
                      </div>
                      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                        {catalogItems.map((item, index) => (
                          <div key={`${item.sku || "item"}-${index}`} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr 1fr", gap: 10 }}>
                              <input style={field} value={item.sku || ""} placeholder="SKU" onChange={(e) => setCatalogItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, sku: e.target.value } : row))} />
                              <input style={field} value={item.name || ""} placeholder="Product name" onChange={(e) => setCatalogItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, name: e.target.value } : row))} />
                              <input style={field} value={item.category || ""} placeholder="Category" onChange={(e) => setCatalogItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, category: e.target.value } : row))} />
                              <input style={field} value={item.unit_price ?? ""} placeholder="Unit price" onChange={(e) => setCatalogItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, unit_price: Number(e.target.value || 0) } : row))} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
                              <input style={field} value={item.currency || ""} placeholder="Currency" onChange={(e) => setCatalogItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, currency: e.target.value } : row))} />
                              <input style={field} value={item.uom || ""} placeholder="UOM" onChange={(e) => setCatalogItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, uom: e.target.value } : row))} />
                              <input style={field} value={item.stock_status || ""} placeholder="Stock status" onChange={(e) => setCatalogItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, stock_status: e.target.value } : row))} />
                            </div>
                            <textarea
                              style={{ ...field, marginTop: 10, minHeight: 72, resize: "vertical" }}
                              value={item.description || ""}
                              placeholder="Description"
                              onChange={(e) => setCatalogItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, description: e.target.value } : row))}
                            />
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 10, alignItems: "center" }}>
                              <input
                                style={{ ...field, maxWidth: 180 }}
                                value={item.lead_time || ""}
                                placeholder="Lead time"
                                onChange={(e) => setCatalogItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, lead_time: e.target.value } : row))}
                              />
                              <button
                                type="button"
                                onClick={() => setCatalogItems((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                                style={{ ...toggleButton, color: "#b91c1c", borderColor: "#fecaca" }}
                              >
                                Remove item
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            setCatalogItems((current) => [
                              ...current,
                              {
                                sku: "",
                                name: "",
                                description: "",
                                category: "",
                                unit_price: 0,
                                currency: "USD",
                                uom: "EA",
                                stock_status: "Available",
                                lead_time: "",
                              },
                            ])
                          }
                          style={toggleButton}
                        >
                          Add catalog item
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ ...featureMetaCard, gridColumn: "1 / -1" }}>
                    <div style={featureMetaLabel}>Catalog JSON</div>
                    <textarea
                      style={{ ...field, marginTop: 6, minHeight: 180, fontFamily: "monospace", resize: "vertical" }}
                      value={storefrontForm.catalog_json}
                      onChange={(e) => setStorefrontForm((prev) => ({ ...prev, catalog_json: e.target.value }))}
                      placeholder='[{ "sku": "ORD-1001", "name": "Product", "unit_price": 100 }]'
                    />
                  </div>
                  <div style={{ ...featureMetaCard, gridColumn: "1 / -1" }}>
                    <div style={featureMetaLabel}>Approved buyers</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
                      Add the buyer email addresses that are allowed to open the storefront and place orders.
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                      <input
                        style={{ ...field, minWidth: 260, flex: "1 1 260px" }}
                        value={approvedBuyerDraft}
                        onChange={(e) => setApprovedBuyerDraft(e.target.value)}
                        placeholder="buyer@company.com"
                      />
                      <button type="button" onClick={addApprovedBuyer} style={toggleButton}>
                        Add approved buyer
                      </button>
                    </div>
                    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                      {approvedBuyerEmails.length ? (
                        approvedBuyerEmails.map((email) => (
                          <div key={email} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 12, padding: "10px 12px", background: "#fff" }}>
                            <div style={{ fontWeight: 700, color: "#0f172a" }}>{email}</div>
                            <button type="button" onClick={() => removeApprovedBuyer(email)} style={{ ...toggleButton, color: "#b91c1c", borderColor: "#fecaca" }}>
                              Remove
                            </button>
                          </div>
                        ))
                      ) : (
                        <div style={{ color: "#64748b", fontSize: 13 }}>No approved buyers added yet.</div>
                      )}
                    </div>
                  </div>

                  <div style={{ ...featureMetaCard, gridColumn: "1 / -1" }}>
                    <div style={featureMetaLabel}>Banner text</div>
                    <input
                      style={{ ...field, marginTop: 6 }}
                      value={storefrontForm.banner_text}
                      onChange={(e) => setStorefrontForm((prev) => ({ ...prev, banner_text: e.target.value }))}
                      placeholder="Optional banner above the hero"
                    />
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: "#64748b", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>Preview state: {storefrontSettingsLoading ? "Loading storefront settings..." : "Ready"}</div>
                  <div>
                    Buyer portal path: {buildStorefrontPath(selectedClient?.client_id || "client-id", scope.environment || "PROD")}
                  </div>
                  <div>
                    Storefront settings are shared across staging and production. Use the {storefrontEnvironmentSlug(scope.environment || "PROD")} URL only for testing the buyer experience in that environment.
                  </div>
                </div>
              </div>

              <div style={syncPanel}>
                <div style={syncPanelHeader}>
                  <div>
                    <div style={syncPanelTitle}>Real-time Sync Status</div>
                    <div style={syncPanelSubtitle}>Track the current setup for master data synchronization with the client ERP.</div>
                  </div>
                </div>
                <div style={syncStatusGrid}>
                  {syncHealth.map((item) => (
                    <div key={item.key} style={syncStatusCard}>
                      <div style={syncStatusTopRow}>
                        <div style={syncStatusName}>{item.label}</div>
                        <div
                          style={{
                            ...syncStatusPill,
                            background:
                              item.status === "READY"
                                ? "#dcfce7"
                                : item.status === "CONFIGURED"
                                  ? "#dbeafe"
                                  : "#fef3c7",
                            color:
                              item.status === "READY"
                                ? "#166534"
                                : item.status === "CONFIGURED"
                                  ? "#1d4ed8"
                                  : "#92400e",
                          }}
                        >
                          {item.status}
                        </div>
                      </div>
                      <div style={syncStatusMeta}>Endpoint: {item.endpoint}</div>
                      <div style={syncStatusMeta}>Direction: {item.direction} • Sync Mode: {item.syncMode}</div>
                      <div style={syncStatusMeta}>Last synced: {item.lastSyncedAt}</div>
                      <div style={syncStatusMeta}>Records synced: {item.recordsSynced}</div>
                      <div style={syncStatusMeta}>Latest event: {item.eventType}</div>
                      <div style={syncStatusMeta}>{item.message}</div>
                      <div style={syncStatusMeta}>ERP registrations: {item.erp.length}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                {["VERTICAL", "CONNECTION", "ERP"].map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)}>
                    {tab}
                  </button>
                ))}
              </div>

              {/* CONTENT */}
              {activeTab === "VERTICAL" && (
                <div>
                  <h4>Business Verticals</h4>
                  {verticals.map((v) => (
                    <div key={v.vertical_id}>{v.vertical_name}</div>
                  ))}
                </div>
              )}

              {activeTab === "CONNECTION" && (
                <div>
                  <h4>Connections</h4>
                  {connections.map((c) => (
                    <div key={c.connection_id}>
                      {c.connection_type} - {c.direction}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "ERP" && (
                <div>
                  <h4>ERP Config</h4>
                  {erpConfigs.map((e) => (
                    <div key={e.erp_config_id}>
                      {e.erp_name} - {e.message_type}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const card = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
};

const header = {
  fontWeight: 800,
  marginBottom: 12,
};

const syncPanel = { border: "1px solid #dbe4ee", borderRadius: 12, padding: 14, marginBottom: 16, background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)" };
const featurePanel = { border: "1px solid #dbe4ee", borderRadius: 12, padding: 14, marginBottom: 16, background: "linear-gradient(180deg, #fffdf7 0%, #ffffff 100%)" };
const featurePanel = { border: "1px solid #dbe4ee", borderRadius: 12, padding: 14, marginBottom: 16, background: "linear-gradient(180deg, #fffdf7 0%, #ffffff 100%)" };
const syncPanelHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" };
const syncPanelTitle = { fontWeight: 800, color: "#0f172a", fontSize: 15 };
const syncPanelSubtitle = { fontSize: 12, color: "#64748b", marginTop: 4 };
const syncStatusGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 12 };
const syncStatusCard = { border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12, display: "grid", gap: 8 };
const syncStatusTopRow = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" };
const syncStatusName = { fontWeight: 800, color: "#0f172a", fontSize: 13 };
const syncStatusPill = { borderRadius: 999, padding: "3px 8px", fontSize: 11, fontWeight: 800 };
const syncStatusMeta = { fontSize: 12, color: "#475569", lineHeight: 1.5 };
const storefrontSetupGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 14 };
const storefrontSetupStep = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, background: "#fff", display: "grid", gap: 8 };
const storefrontSetupStepTitle = { fontWeight: 800, color: "#0f172a", fontSize: 13 };
const storefrontSetupStepCopy = { fontSize: 12, color: "#475569", lineHeight: 1.55 };
