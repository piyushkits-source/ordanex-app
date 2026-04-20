import { useEffect, useState } from "react";
import PageHeader from "../components/common/PageHeader";
import { apiFetch } from "../utils/api";

const API = "/client-config";

export default function ClientConfigPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any>(null);

  const [verticals, setVerticals] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [erpConfigs, setErpConfigs] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState("VERTICAL");

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      loadAll(selectedClient.client_id);
    }
  }, [selectedClient]);

  async function loadClients() {
    const res = await apiFetch(`${API}/clients`);
    setClients(await res.json());
  }

  async function loadAll(clientId: string) {
    const [v, c, e] = await Promise.all([
      apiFetch(`${API}/verticals/${clientId}`),
      apiFetch(`${API}/connections/${clientId}`),
      apiFetch(`${API}/erp/${clientId}`),
    ]);

    setVerticals(await v.json());
    setConnections(await c.json());
    setErpConfigs(await e.json());
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