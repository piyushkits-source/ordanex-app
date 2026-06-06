import React, { useEffect, useMemo, useState } from "react";
import { apiFetch, parseApiError } from "../../../utils/api";

const API_BASE = "/client-config";

type ClientRow = {
  client_id: string;
  client_name?: string;
};

type ConnectionType = "EMAIL" | "SFTP" | "AS2" | "API";
type DirectionType = "INBOUND" | "OUTBOUND" | "BOTH";

type ConnectionRow = {
  connection_id: string;
  client_id?: string;
  connection_name: string;
  connection_type: ConnectionType;
  direction: DirectionType;
  message_type?: string;
  message_version?: string;
  vertical_id?: string | null;
  config_json?: Record<string, string> | null;
  is_active?: boolean;
};

type FormState = {
  connection_name: string;
  connection_type: ConnectionType;
  direction: DirectionType;
  message_type: string;
  message_version: string;
  is_active: boolean;
  config_json: Record<string, string>;
};

type Props = {
  client: ClientRow;
  selectedVerticalId?: string;
  onBanner: (text: string, type?: "success" | "error" | "info") => void;
};

type ConfigField = {
  key: string;
  label: string;
  type?: string;
  placeholder?: string;
};

const CONFIG_FIELDS: Record<ConnectionType, ConfigField[]> = {
  EMAIL: [
    { key: "email_address", label: "Email Address", placeholder: "orders@client.com" },
    { key: "folder", label: "Folder", placeholder: "Inbox" },
    { key: "subject_filter", label: "Subject Filter", placeholder: "PO / ASN / Invoice" },
    { key: "username", label: "Username", placeholder: "mailbox user" },
    { key: "password_token", label: "Password Token", type: "password", placeholder: "mail app password" },
    { key: "imap_host", label: "IMAP Host", placeholder: "imap.gmail.com" },
    { key: "port", label: "Port", type: "number", placeholder: "993" },
  ],
  SFTP: [
    { key: "host", label: "Host", placeholder: "sftp.client.com" },
    { key: "port", label: "Port", type: "number", placeholder: "22" },
    { key: "username", label: "Username", placeholder: "service account" },
    { key: "password_token", label: "Password Token", type: "password", placeholder: "password / token" },
    { key: "folder", label: "Remote Folder", placeholder: "/inbound/orders" },
    { key: "archive_path", label: "Archive Path", placeholder: "/archive/orders" },
  ],
  AS2: [
    { key: "as2_id", label: "AS2 ID", placeholder: "CLIENT_AS2_ID" },
    { key: "partner_as2_id", label: "Partner AS2 ID", placeholder: "ORDANEX_AS2_ID" },
    { key: "endpoint", label: "Endpoint URL", placeholder: "https://partner/as2" },
    { key: "certificate_ref", label: "Certificate Ref", placeholder: "cert alias / ref" },
  ],
  API: [
    { key: "endpoint_url", label: "Endpoint URL", placeholder: "https://api.client.com/orders" },
    { key: "resource_path", label: "Resource Path", placeholder: "/uom / /addresses" },
    { key: "sync_object", label: "Sync Object", placeholder: "UOM / ADDRESS" },
    { key: "sync_mode", label: "Sync Mode", placeholder: "REAL_TIME / SCHEDULED" },
    { key: "webhook_url", label: "Webhook URL", placeholder: "https://erp.client.com/webhooks/uom" },
    { key: "webhook_secret", label: "Webhook Secret", type: "password", placeholder: "webhook signing secret" },
    { key: "http_method", label: "HTTP Method", placeholder: "POST" },
    { key: "auth_type", label: "Auth Type", placeholder: "BASIC / BEARER / OAUTH2" },
    { key: "username", label: "Username", placeholder: "api user" },
    { key: "password_token", label: "Password Token", type: "password", placeholder: "secret / token" },
    { key: "token", label: "Bearer Token", type: "password", placeholder: "JWT / access token" },
  ],
};

const buildEmptyForm = (): FormState => ({
  connection_name: "",
  connection_type: "EMAIL",
  direction: "INBOUND",
  message_type: "PO",
  message_version: "",
  is_active: true,
  config_json: {},
});

function normalizeConfig(type: ConnectionType, config: Record<string, string> | null | undefined) {
  const c = { ...(config || {}) };

  if (type === "API" && c.endpoint && !c.endpoint_url) {
    c.endpoint_url = c.endpoint;
  }

  if (type === "EMAIL" && c.mailbox_address && !c.email_address) {
    c.email_address = c.mailbox_address;
  }

  return c;
}

function getConnectionDetails(row: ConnectionRow) {
  const cfg = normalizeConfig(row.connection_type, row.config_json);

  switch (row.connection_type) {
    case "EMAIL":
      return `${cfg.email_address || "-"} (${cfg.folder || "Inbox"})`;

    case "SFTP":
      return `${cfg.host || "-"}:${cfg.port || "22"} ${cfg.folder || ""}`.trim();

    case "API":
      return `${cfg.http_method || "POST"} ${cfg.endpoint_url || "-"}${cfg.sync_object ? ` | ${cfg.sync_object}` : ""}${cfg.sync_mode ? ` | ${cfg.sync_mode}` : ""}`;

    case "AS2":
      return `${cfg.as2_id || "-"}${cfg.partner_as2_id ? ` | ${cfg.partner_as2_id}` : ""}${cfg.endpoint ? ` | ${cfg.endpoint}` : ""}`;

    default:
      return "-";
  }
}

const MASTER_DATA_SYNC_PRESETS = [
  {
    id: "uom-sync",
    label: "UOM Sync",
    description: "Keep client UOM tables aligned with ERP defaults and conversion rules in real time.",
    message_type: "UOM_SYNC",
    config_json: {
      endpoint_url: "https://erp.client.com/api/uom",
      resource_path: "/uom",
      sync_object: "UOM",
      sync_mode: "REAL_TIME",
      webhook_url: "https://erp.client.com/webhooks/uom",
      http_method: "POST",
      auth_type: "BEARER",
    },
  },
  {
    id: "address-sync",
    label: "Address Sync",
    description: "Keep ship-to, sold-to, bill-to, supplier, and warehouse addresses in sync with the client ERP.",
    message_type: "ADDRESS_SYNC",
    config_json: {
      endpoint_url: "https://erp.client.com/api/addresses",
      resource_path: "/addresses",
      sync_object: "ADDRESS",
      sync_mode: "REAL_TIME",
      webhook_url: "https://erp.client.com/webhooks/addresses",
      http_method: "POST",
      auth_type: "BEARER",
    },
  },
] as const;

export default function ClientConnectionsSection({
  client,
  selectedVerticalId,
  onBanner,
}: Props) {
  const [rows, setRows] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(buildEmptyForm());

  const dynamicFields = useMemo(
    () => CONFIG_FIELDS[form.connection_type] || [],
    [form.connection_type]
  );

  function applySyncPreset(presetId: string) {
    const preset = MASTER_DATA_SYNC_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;

    setEditingId(null);
    setForm({
      connection_name: `${client.client_name || "Client"} ${preset.label}`,
      connection_type: "API",
      direction: "BOTH",
      message_type: preset.message_type,
      message_version: "v1",
      is_active: true,
      config_json: { ...preset.config_json },
    });
    onBanner(`Loaded ${preset.label} preset for client ERP sync.`, "info");
  }

  useEffect(() => {
    if (client.client_id) {
      resetForm();
      void loadRows();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.client_id, selectedVerticalId]);

  async function loadRows() {
    try {
      setLoading(true);
      const res = await apiFetch(
        `${API_BASE}/connections/${encodeURIComponent(client.client_id)}`,
        { method: "GET" }
      );

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      const data = await res.json();
      const list = Array.isArray(data) ? data : [];

      setRows(
        selectedVerticalId
          ? list.filter((x) => (x.vertical_id || "") === selectedVerticalId)
          : list
      );
    } catch (err: any) {
      onBanner(err?.message || "Failed to load client connections.", "error");
    } finally {
      setLoading(false);
    }
  }

  function updateConfig(key: string, value: string) {
    setForm((prev) => ({
      ...prev,
      config_json: {
        ...prev.config_json,
        [key]: value,
      },
    }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(buildEmptyForm());
  }

  function editRow(row: ConnectionRow) {
    setEditingId(row.connection_id);
    setForm({
      connection_name: row.connection_name,
      connection_type: row.connection_type,
      direction: row.direction,
      message_type: row.message_type || "PO",
      message_version: row.message_version || "",
      is_active: row.is_active ?? true,
      config_json: normalizeConfig(row.connection_type, row.config_json),
    });
  }

  async function saveRow() {
    try {
      if (!form.connection_name.trim()) {
        throw new Error("Connection Name is required.");
      }

      setSaving(true);

      const payload = {
        client_id: client.client_id,
        vertical_id: selectedVerticalId || null,
        connection_name: form.connection_name,
        connection_type: form.connection_type,
        direction: form.direction,
        message_type: form.message_type,
        message_version: form.message_version,
        is_active: form.is_active,
        config_json: normalizeConfig(form.connection_type, form.config_json),
      };

      const isEdit = Boolean(editingId);
      const url = isEdit
        ? `${API_BASE}/connections/${encodeURIComponent(editingId as string)}`
        : `${API_BASE}/connections`;

      const res = await apiFetch(url, {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      onBanner(
        isEdit
          ? "Client connection updated successfully."
          : "Client connection saved successfully.",
        "success"
      );

      resetForm();
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to save client connection.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: ConnectionRow) {
    try {
      const res = await apiFetch(
        `${API_BASE}/connections/${encodeURIComponent(row.connection_id)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            client_id: client.client_id,
            vertical_id: row.vertical_id || null,
            connection_name: row.connection_name,
            connection_type: row.connection_type,
            direction: row.direction,
            message_type: row.message_type || "PO",
            message_version: row.message_version || "",
            is_active: !(row.is_active ?? true),
            config_json: normalizeConfig(row.connection_type, row.config_json),
          }),
        }
      );

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      onBanner("Connection status updated.", "success");
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to update connection status.", "error");
    }
  }

  return (
    <div style={card}>
      <div style={headerRow}>
        <div>
          <div style={title}>Client Connections</div>
          <div style={subtitle}>
            Define how the selected client exchanges messages with Ordanex.
            When a business vertical is selected, the connection is saved against that vertical.
          </div>
        </div>
        <div style={scopePill}>
          {selectedVerticalId ? "Vertical-scoped" : "Client-scoped"}
        </div>
      </div>

      <div style={syncPresetPanel}>
        <div style={syncPresetTitle}>ERP Table Sync Presets</div>
        <div style={syncPresetSubtitle}>
          Preconfigure API connections for real-time UOM and Address synchronization with the client ERP.
        </div>
        <div style={syncPresetGrid}>
          {MASTER_DATA_SYNC_PRESETS.map((preset) => (
            <div key={preset.id} style={syncPresetCard}>
              <div style={syncPresetBadge}>API Sync</div>
              <div style={syncPresetName}>{preset.label}</div>
              <div style={syncPresetCopy}>{preset.description}</div>
              <div style={syncPresetMeta}>
                {preset.config_json.sync_object} • {preset.config_json.sync_mode} • {preset.config_json.auth_type}
              </div>
              <button type="button" style={presetButton} onClick={() => applySyncPreset(preset.id)}>
                Use preset
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={sectionTitle}>Connection Setup</div>

      <div style={grid3}>
        {field(
          "Connection Name",
          <input
            value={form.connection_name}
            onChange={(e) => setForm({ ...form, connection_name: e.target.value })}
            style={inputStyle}
            placeholder="e.g. SAP Inbound Email"
          />
        )}

        {field(
          "Connection Type",
          <select
            value={form.connection_type}
            onChange={(e) =>
              setForm({
                ...form,
                connection_type: e.target.value as ConnectionType,
                config_json: {},
              })
            }
            style={inputStyle}
          >
            <option value="EMAIL">EMAIL</option>
            <option value="SFTP">SFTP</option>
            <option value="AS2">AS2</option>
            <option value="API">API</option>
          </select>
        )}

        {field(
          "Direction",
          <select
            value={form.direction}
            onChange={(e) =>
              setForm({ ...form, direction: e.target.value as DirectionType })
            }
            style={inputStyle}
          >
            <option value="INBOUND">INBOUND</option>
            <option value="OUTBOUND">OUTBOUND</option>
            <option value="BOTH">BOTH</option>
          </select>
        )}

        {field(
          "Message Type",
          <select
            value={form.message_type}
            onChange={(e) => setForm({ ...form, message_type: e.target.value })}
            style={inputStyle}
          >
            <option value="PO">PO</option>
            <option value="ORDER_CONFIRMATION">ORDER_CONFIRMATION</option>
            <option value="ASN">ASN</option>
            <option value="INVOICE">INVOICE</option>
            <option value="ORDER_RESPONSE">ORDER_RESPONSE</option>
            <option value="DELFOR">DELFOR</option>
          </select>
        )}

        {field(
          "Message Version",
          <input
            value={form.message_version}
            onChange={(e) => setForm({ ...form, message_version: e.target.value })}
            style={inputStyle}
            placeholder="e.g. ORDERS05 / D97A / v1"
          />
        )}

        {field(
          "Status",
          <select
            value={form.is_active ? "ACTIVE" : "INACTIVE"}
            onChange={(e) =>
              setForm({ ...form, is_active: e.target.value === "ACTIVE" })
            }
            style={inputStyle}
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        )}
      </div>

      <div style={sectionTitle}>Protocol Configuration</div>

      <div style={grid3}>
        {dynamicFields.map((f) =>
          field(
            f.label,
            <input
              key={f.key}
              type={f.type || "text"}
              value={form.config_json?.[f.key] || ""}
              onChange={(e) => updateConfig(f.key, e.target.value)}
              style={inputStyle}
              placeholder={f.placeholder}
            />
          )
        )}
      </div>

      <div style={buttonRow}>
        <button type="button" style={primaryButton} onClick={saveRow} disabled={saving}>
          {saving ? "Saving..." : editingId ? "Update Connection" : "Save Connection"}
        </button>

        {editingId ? (
          <button type="button" style={secondaryButton} onClick={resetForm}>
            Cancel
          </button>
        ) : null}
      </div>

      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Direction</th>
              <th style={thStyle}>Message</th>
              <th style={thStyle}>Scope</th>
              <th style={thStyle}>Details</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={tdEmptyStyle}>
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} style={tdEmptyStyle}>
                  No client connections configured.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.connection_id}>
                  <td style={tdStyle}>{row.connection_name}</td>
                  <td style={tdStyle}>{row.connection_type}</td>
                  <td style={tdStyle}>{row.direction}</td>
                  <td style={tdStyle}>
                    {row.message_type || "-"}
                    {row.message_version ? ` (${row.message_version})` : ""}
                  </td>
                  <td style={tdStyle}>{row.vertical_id ? "Vertical" : "Client"}</td>
                  <td style={tdStyle}>{getConnectionDetails(row)}</td>
                  <td style={tdStyle}>{row.is_active ? "ACTIVE" : "INACTIVE"}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" style={miniButton} onClick={() => editRow(row)}>
                        Edit
                      </button>
                      <button type="button" style={miniButton} onClick={() => toggleActive(row)}>
                        {row.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function field(label: string, children: React.ReactNode) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #eef2f7",
  borderRadius: 12,
  background: "#fff",
  padding: 16,
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 16,
  flexWrap: "wrap",
};

const title: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "#0f172a",
};

const subtitle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginTop: 4,
  maxWidth: 760,
};

const scopePill: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  background: "#fff",
  color: "#334155",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "#334155",
  marginTop: 8,
  marginBottom: 10,
};

const grid3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 14,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 40,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #dbe4ee",
  background: "#fff",
  fontSize: 13,
  color: "#0f172a",
  outline: "none",
  boxSizing: "border-box",
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 14,
};

const primaryButton: React.CSSProperties = {
  border: "1px solid #0b5fff",
  background: "#0b5fff",
  color: "#fff",
  borderRadius: 10,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  background: "#fff",
  color: "#334155",
  borderRadius: 10,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const miniButton: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  background: "#fff",
  color: "#334155",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const syncPresetPanel: React.CSSProperties = {
  marginBottom: 16,
  padding: 14,
  border: "1px solid #dbe4ee",
  borderRadius: 12,
  background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)",
};

const syncPresetTitle: React.CSSProperties = { fontSize: 15, fontWeight: 800, color: "#0f172a" };
const syncPresetSubtitle: React.CSSProperties = { fontSize: 12, color: "#64748b", marginTop: 4 };
const syncPresetGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 12 };
const syncPresetCard: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12, display: "grid", gap: 8 };
const syncPresetBadge: React.CSSProperties = { width: "fit-content", padding: "3px 8px", borderRadius: 999, background: "#dbeafe", color: "#1d4ed8", fontSize: 11, fontWeight: 800 };
const syncPresetName: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: "#0f172a" };
const syncPresetCopy: React.CSSProperties = { fontSize: 12, color: "#64748b", lineHeight: 1.5 };
const syncPresetMeta: React.CSSProperties = { fontSize: 11, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.2 };
const presetButton: React.CSSProperties = { border: "1px solid #dbe4ee", background: "#fff", color: "#0f172a", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" };

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: 12,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  fontWeight: 800,
  color: "#334155",
  borderBottom: "1px solid #e5e7eb",
  background: "#f8fafc",
  verticalAlign: "top",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  color: "#0f172a",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "top",
};

const tdEmptyStyle: React.CSSProperties = {
  padding: "16px 12px",
  fontSize: 13,
  color: "#64748b",
  borderBottom: "1px solid #eef2f7",
};
