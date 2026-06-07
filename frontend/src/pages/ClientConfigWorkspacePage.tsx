import React, { useEffect, useMemo, useState } from "react";
import PageHeader from "components/common/PageHeader";
import ClientMasterSection from "components/client_config/sections/ClientMasterSection";
import BusinessVerticalSection from "components/client_config/sections/BusinessVerticalSection";
import ClientConnectionsSection from "components/client_config/sections/ClientConnectionsSection";
import ClientErpMessagesSection from "components/client_config/sections/ClientErpMessagesSection";
import ClientStorefrontSection from "components/client_config/sections/ClientStorefrontSection";
import { apiFetch, parseApiError } from "utils/api";
import { useAppScope } from "context/AppScopeContext";

const API_BASE = "/client-config";

type ClientRow = {
  client_id: string;
  client_name: string;
  status?: string;
  subscription_type?: string | null;
  default_currency?: string | null;
  default_vendor?: string | null;
  default_sold_to?: string | null;
  default_ship_to?: string | null;
};

type SectionKey = "CLIENT" | "STOREFRONT" | "VERTICALS" | "CONNECTIONS" | "ERP";

const sections: { key: SectionKey; label: string; helper: string }[] = [
  { key: "CLIENT", label: "Client Master", helper: "Identity, subscription, workspace defaults, legal, billing, and banking setup" },
  { key: "STOREFRONT", label: "Storefront", helper: "Buyer portal setup, approval list, and catalog source" },
  { key: "VERTICALS", label: "Business Verticals", helper: "Business entities that operate under the client" },
  { key: "CONNECTIONS", label: "Client Connections", helper: "How the client exchanges messages with Ordanex" },
  { key: "ERP", label: "ERP & Message Types", helper: "ERP landscape, formats, message types, and directions" },
];

export default function ClientConfigWorkspacePage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [activeSection, setActiveSection] = useState<SectionKey>("CLIENT");
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [createMode, setCreateMode] = useState(false);

  const { scope, setClientScope, setVerticalScope, setEnvironmentScope } = useAppScope();
  const isProductionSelected = String(scope.environment || "PROD").toUpperCase() === "PROD";

  const selectedClient = useMemo(
    () => clients.find((c) => c.client_id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("ordanet_selected_vertical");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setVerticalScope({
          verticalId: parsed.verticalId || "",
          verticalName: parsed.verticalName || "",
        });
      } catch {
        // ignore malformed local storage
      }
    }
  }, [setVerticalScope]);

  async function loadClients() {
    try {
      setLoading(true);
      setBanner(null);
      const res = await apiFetch(`${API_BASE}/clients`, { method: "GET" });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      const rows = Array.isArray(data) ? data : [];
      setClients(rows);

      if (rows.length > 0 && !selectedClientId && !createMode) {
        const first = rows[0];
        setSelectedClientId(first.client_id);
        setClientScope({
          clientId: first.client_id,
          clientName: first.client_name,
        });
      }
    } catch (err: any) {
      setBanner({ type: "error", text: err?.message || "Failed to load clients." });
    } finally {
      setLoading(false);
    }
  }

  function onClientSelect(client: ClientRow) {
    setCreateMode(false);
    setSelectedClientId(client.client_id);
    setClientScope({ clientId: client.client_id, clientName: client.client_name });
    setVerticalScope({ verticalId: "", verticalName: "" });
    localStorage.removeItem("ordanet_selected_vertical");
  }

  function onVerticalSelect(vertical: any) {
    setVerticalScope({
      verticalId: vertical.vertical_id,
      verticalName: vertical.vertical_name,
    });
    localStorage.setItem(
      "ordanet_selected_vertical",
      JSON.stringify({
        verticalId: vertical.vertical_id,
        verticalName: vertical.vertical_name,
      })
    );
    setBanner({ type: "success", text: `Active vertical set to ${vertical.vertical_name}.` });
  }

  function handleNewClient() {
    setCreateMode(true);
    setSelectedClientId("");
    setClientScope({ clientId: "", clientName: "" });
    setVerticalScope({ verticalId: "", verticalName: "" });
    localStorage.removeItem("ordanet_selected_vertical");
    setActiveSection("CLIENT");
    setBanner({ type: "info", text: "Ready to create a new client." });
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      <PageHeader
        title="Client Configuration"
        subtitle="Maintain client master, business verticals, connectivity, and ERP/message capabilities in one guided workspace."
      />

      {banner ? (
        <div
          style={{
            ...bannerStyle,
            borderColor:
              banner.type === "success" ? "#bbf7d0" : banner.type === "error" ? "#fecaca" : "#bfdbfe",
            background:
              banner.type === "success" ? "#f0fdf4" : banner.type === "error" ? "#fef2f2" : "#eff6ff",
            color:
              banner.type === "success" ? "#166534" : banner.type === "error" ? "#b91c1c" : "#1d4ed8",
          }}
        >
          {banner.text}
        </div>
      ) : null}

      <div style={contextCard}>
        <div style={contextTopRow}>
          <div>
            <div style={contextTitle}>Active Client Context</div>
            {!selectedClient && !createMode ? (
              <div style={contextMeta}>Select a client or create a new one.</div>
            ) : createMode ? (
              <div style={contextMeta}>Create mode active. Save Client Master to unlock the remaining sections.</div>
            ) : (
              <>
                <div style={contextMeta}>
                  {selectedClient?.client_id} • {selectedClient?.client_name} • {selectedClient?.status || "ACTIVE"} • {selectedClient?.subscription_type || "-"}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: "#475569" }}>
                  Vertical: {scope.verticalName || scope.verticalId || "Not Selected"}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: "#475569" }}>
                  Environment: {String(scope.environment || "PROD").toUpperCase() === "PROD" ? "Production" : "Staging"}
                </div>
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select
              value={scope.environment || "PROD"}
              onChange={(e) => setEnvironmentScope(e.target.value)}
              style={envSelect}
            >
              <option value="PROD">Production</option>
              <option value="STAGING">Staging</option>
            </select>
            <div style={statusChip}>{createMode ? "Create Mode" : "Workspace Mode"}</div>
            <div style={statusChipMuted}>{sections.find((s) => s.key === activeSection)?.label}</div>
          </div>
        </div>
      </div>

      {isProductionSelected ? (
        <div style={productionBanner}>
          Production is read-only for configuration. Switch the active environment to Staging to create, edit, or update Client Configuration.
        </div>
      ) : null}

      <div style={layout}>
        <div style={leftPanel}>
          <div style={panelTopRow}>
            <div style={panelTitle}>Clients</div>
            <button type="button" onClick={handleNewClient} style={newButton}>
              + New Client
            </button>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {loading ? (
              <div style={emptyText}>Loading clients...</div>
            ) : clients.length === 0 ? (
              <div style={emptyText}>No clients found. Create your first client.</div>
            ) : (
              clients.map((client) => {
                const active = !createMode && selectedClientId === client.client_id;
                return (
                  <button
                    key={client.client_id}
                    type="button"
                    onClick={() => onClientSelect(client)}
                    style={{
                      ...clientButton,
                      background: active ? "#eff6ff" : "#fff",
                      border: active ? "1.5px solid #2563eb" : "1px solid #e5e7eb",
                    }}
                  >
                    <div style={clientName}>{client.client_name}</div>
                    <div style={clientMeta}>{client.client_id}</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>
                      {client.subscription_type || "BASIC"} • {client.status || "ACTIVE"}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div style={midPanel}>
          <div style={panelTitle}>Sections</div>
          <div style={{ display: "grid", gap: 8 }}>
            {sections.map((section) => {
              const active = activeSection === section.key;
              const disabled = createMode && section.key !== "CLIENT";
              return (
                <button
                  key={section.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => setActiveSection(section.key)}
                  style={{
                    ...sectionButton,
                    opacity: disabled ? 0.55 : 1,
                    cursor: disabled ? "not-allowed" : "pointer",
                    background: active ? "#0b5fff" : "#fff",
                    color: active ? "#fff" : "#0f172a",
                    border: active ? "1px solid #0b5fff" : "1px solid #e5e7eb",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>{section.label}</div>
                  <div style={{ marginTop: 4, fontSize: 11, opacity: active ? 0.9 : 0.7 }}>{section.helper}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={workspace}>
          {!selectedClient && !createMode ? (
            <div style={emptyWorkspace}>Select a client or create a new one.</div>
          ) : (
            <>
              {activeSection === "CLIENT" && (
                <ClientMasterSection
                  client={createMode ? null : selectedClient}
                  onSaved={async () => {
                    setCreateMode(false);
                    await loadClients();
                  }}
                  onBanner={(text, type = "success") => setBanner({ text, type })}
                />
              )}

              {activeSection === "STOREFRONT" && selectedClient && (
                <ClientStorefrontSection
                  client={selectedClient}
                  onBanner={(text, type = "success") => setBanner({ text, type })}
                />
              )}

              {activeSection === "VERTICALS" && selectedClient && (
                <BusinessVerticalSection
                  client={selectedClient}
                  onBanner={(text, type = "success") => setBanner({ text, type })}
                  onSelectVertical={onVerticalSelect}
                  selectedVerticalId={scope.verticalId}
                />
              )}

              {activeSection === "CONNECTIONS" && selectedClient && (
                <ClientConnectionsSection
                  client={selectedClient}
                  selectedVerticalId={scope.verticalId}
                  onBanner={(text, type = "success") => setBanner({ text, type })}
                />
              )}

              {activeSection === "ERP" && selectedClient && (
                <ClientErpMessagesSection
                  client={selectedClient}
                  selectedVerticalId={scope.verticalId}
                  onBanner={(text, type = "success") => setBanner({ text, type })}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const layout: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "300px 240px 1fr",
  gap: 16,
  alignItems: "start",
};
const leftPanel: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", padding: 14 };
const midPanel: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", padding: 14 };
const workspace: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", padding: 18, minHeight: 560 };
const panelTopRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12 };
const panelTitle: React.CSSProperties = { fontSize: 15, fontWeight: 800, color: "#0f172a" };
const clientButton: React.CSSProperties = { textAlign: "left", borderRadius: 12, padding: 12 };
const clientName: React.CSSProperties = { fontWeight: 700, color: "#0f172a" };
const clientMeta: React.CSSProperties = { fontSize: 12, color: "#64748b", marginTop: 4 };
const sectionButton: React.CSSProperties = { textAlign: "left", borderRadius: 12, padding: 12 };
const contextCard: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)", padding: 16, marginBottom: 16 };
const contextTopRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" };
const contextTitle: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: "#0f172a" };
const contextMeta: React.CSSProperties = { fontSize: 12, color: "#64748b", marginTop: 4 };
const emptyText: React.CSSProperties = { color: "#64748b", fontSize: 13 };
const emptyWorkspace: React.CSSProperties = { color: "#64748b", fontSize: 14, padding: 20 };
const bannerStyle: React.CSSProperties = { marginBottom: 14, border: "1px solid", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 600 };
const newButton: React.CSSProperties = { border: "1px solid #0b5fff", background: "#0b5fff", color: "#fff", borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontWeight: 700, fontSize: 12 };
const statusChip: React.CSSProperties = { border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 700 };
const statusChipMuted: React.CSSProperties = { border: "1px solid #e5e7eb", background: "#fff", color: "#475569", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 700 };
const envSelect: React.CSSProperties = { minHeight: 34, borderRadius: 999, border: "1px solid #dbe4ee", background: "#fff", color: "#0f172a", padding: "6px 12px", fontSize: 12, fontWeight: 700 };
const productionBanner: React.CSSProperties = { marginBottom: 14, border: "1px solid #fecaca", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fef2f2" };
