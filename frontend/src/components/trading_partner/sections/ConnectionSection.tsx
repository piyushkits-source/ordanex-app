import React, { useEffect, useMemo, useState } from "react";
import { apiFetch, parseApiError } from "utils/api";
import { PartnerConnection, TradingPartner } from "types/tradingPartner";

const API_BASE = "/trading-partners";

const CONFIG_FIELDS: Record<
  string,
  { key: string; label: string; type?: string; placeholder?: string }[]
> = {
  EMAIL: [
    { key: "email_address", label: "Mailbox Address" },
    { key: "folder", label: "Folder", placeholder: "Inbox" },
    { key: "subject_filter", label: "Subject Filter" },
    { key: "username", label: "Username" },
    { key: "password_token", label: "Password Token", type: "password" },
    { key: "imap_host", label: "IMAP Host", placeholder: "imap.gmail.com" },
    { key: "port", label: "Port", type: "number", placeholder: "993" },
  ],
  SFTP: [
    { key: "host", label: "Host" },
    { key: "port", label: "Port", type: "number", placeholder: "22" },
    { key: "username", label: "Username" },
    { key: "password_token", label: "Password Token", type: "password" },
    { key: "folder", label: "Remote Folder" },
    { key: "archive_path", label: "Archive Path" },
  ],
  AS2: [
    { key: "as2_id", label: "AS2 ID" },
    { key: "partner_as2_id", label: "Partner AS2 ID" },
    { key: "endpoint", label: "Endpoint URL" },
    { key: "certificate_ref", label: "Certificate Ref" },
  ],
  API: [
    { key: "endpoint_url", label: "Endpoint URL" },
    { key: "http_method", label: "HTTP Method", placeholder: "POST" },
    { key: "auth_type", label: "Auth Type", placeholder: "BASIC / BEARER / OAUTH2" },
    { key: "username", label: "Username" },
    { key: "password_token", label: "Password Token", type: "password" },
    { key: "token", label: "Bearer Token", type: "password" },
  ],
  VAN: [
    { key: "provider", label: "VAN Provider" },
    { key: "mailbox", label: "Mailbox" },
    { key: "network_id", label: "Network ID" },
  ],
};

const emptyConnection = (partner: TradingPartner): PartnerConnection => ({
  client_id: partner.client_id,
  partner_id: partner.partner_id,
  connection_name: "",
  connection_type: "EMAIL",
  direction: "INBOUND",
  message_type: "PO",
  message_version: "",
  config_json: {},
  is_active: true,
});

function normalizeConfig(type: string, config: Record<string, any> | null | undefined) {
  const c = { ...(config || {}) };

  if (type === "API" && c.endpoint && !c.endpoint_url) {
    c.endpoint_url = c.endpoint;
  }

  if (type === "EMAIL" && c.mailbox_address && !c.email_address) {
    c.email_address = c.mailbox_address;
  }

  if (type === "EMAIL") {
    if (c.host && !c.imap_host) c.imap_host = c.host;
    if (c.imap_port && !c.port) c.port = c.imap_port;
    if (c.mailbox && !c.folder) c.folder = c.mailbox;
    if (!c.username && c.email_address) c.username = c.email_address;
    if (!c.folder) c.folder = "INBOX";
  }

  return c;
}

function validateConnection(form: PartnerConnection) {
  if (!form.connection_name?.trim()) {
    return "Connection Name is required.";
  }

  const cfg = normalizeConfig(form.connection_type, form.config_json);
  if (form.connection_type !== "EMAIL" || !form.is_active) {
    return null;
  }

  const missing = ["email_address", "imap_host", "username", "password_token"].filter(
    (key) => !String(cfg?.[key] || "").trim()
  );

  return missing.length > 0
    ? `Missing required EMAIL settings: ${missing.join(", ")}`
    : null;
}

function getConnectionDetails(row: PartnerConnection) {
  const cfg = normalizeConfig(row.connection_type, row.config_json);

  switch (row.connection_type) {
    case "EMAIL":
      return [
        cfg.email_address || "-",
        cfg.folder || "-",
        cfg.subject_filter || "-",
      ].join(" | ");

    case "SFTP":
      return [cfg.host || "-", cfg.folder || "-", cfg.username || "-"].join(" | ");

    case "AS2":
      return [
        cfg.as2_id || "-",
        cfg.partner_as2_id || "-",
        cfg.endpoint || "-",
      ].join(" | ");

    case "API":
      return [
        cfg.http_method || "POST",
        cfg.endpoint_url || "-",
        cfg.auth_type || "-",
      ].join(" | ");

    case "VAN":
      return [cfg.provider || "-", cfg.mailbox || "-", cfg.network_id || "-"].join(" | ");

    default:
      return "-";
  }
}

export default function ConnectionSection({
  partner,
  onBanner,
}: {
  partner: TradingPartner;
  onBanner: (text: string) => void;
}) {
  const [rows, setRows] = useState<PartnerConnection[]>([]);
  const [form, setForm] = useState<PartnerConnection>(emptyConnection(partner));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const dynamicFields = useMemo(
    () => CONFIG_FIELDS[form.connection_type] || [],
    [form.connection_type]
  );

  useEffect(() => {
    setForm(emptyConnection(partner));
    setEditingId(null);
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partner.partner_id]);

  async function loadRows() {
    try {
      setLoading(true);
      const res = await apiFetch(`${API_BASE}/${partner.partner_id}/connections`, {
        method: "GET",
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      onBanner(err?.message || "Failed to load partner connections.");
    } finally {
      setLoading(false);
    }
  }

  async function saveConnection() {
    try {
      const validationError = validateConnection(form);
      if (validationError) {
        throw new Error(validationError);
      }

      setSaving(true);

      const payload = {
        ...form,
        config_json: normalizeConfig(form.connection_type, form.config_json),
      };

      const isEdit = Boolean(editingId);
      const url = isEdit
        ? `${API_BASE}/connections/${editingId}`
        : `${API_BASE}/${partner.partner_id}/connections`;

      const res = await apiFetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await parseApiError(res));

      onBanner(isEdit ? "Partner connection updated successfully." : "Partner connection saved successfully.");
      resetForm();
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to save partner connection.");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection(row: PartnerConnection) {
    try {
      setActionBusyKey(`test:${row.connection_id}`);
      const res = await apiFetch(`${API_BASE}/connections/${row.connection_id}/test`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      onBanner(data.message || "Connection test succeeded.");
    } catch (err: any) {
      onBanner(err?.message || "Unable to test connection.");
    } finally {
      setActionBusyKey(null);
    }
  }

  async function pollConnection(row: PartnerConnection) {
    try {
      setActionBusyKey(`poll:${row.connection_id}`);
      const res = await apiFetch(`${API_BASE}/connections/${row.connection_id}/poll`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      onBanner(
        `Email poll complete. Imported ${data.imported ?? 0}, skipped ${data.skipped ?? 0}, errors ${data.errors ?? 0}.`
      );
    } catch (err: any) {
      onBanner(err?.message || "Unable to run email poll.");
    } finally {
      setActionBusyKey(null);
    }
  }

  async function toggleActive(row: PartnerConnection) {
    try {
      const res = await apiFetch(
        `${API_BASE}/connections/${row.connection_id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...row,
            is_active: !row.is_active,
            config_json: normalizeConfig(row.connection_type, row.config_json),
          }),
        }
      );

      if (!res.ok) throw new Error(await parseApiError(res));
      onBanner("Connection status updated.");
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to update connection status.");
    }
  }

  function editRow(row: PartnerConnection) {
    setEditingId(String(row.connection_id || ""));
    setForm({
      ...row,
      message_version: row.message_version || "",
      config_json: normalizeConfig(row.connection_type, row.config_json),
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyConnection(partner));
  }

  function updateConfig(key: string, value: string) {
    setForm((prev) => ({
      ...prev,
      config_json: {
        ...(prev.config_json || {}),
        [key]: value,
      },
    }));
  }

  return (
    <div style={card}>
      <div style={headerRow}>
        <div>
          <div style={title}>Partner Connections</div>
          <div style={subTitle}>
            Configure how trading partners exchange messages with Ordanex.
          </div>
        </div>
      </div>

      <div style={grid}>
        {field(
          "Connection Name",
          <input
            value={form.connection_name}
            onChange={(e) => setForm({ ...form, connection_name: e.target.value })}
            style={input}
          />
        )}

        {field(
          "Connection Type",
          <select
            value={form.connection_type}
            onChange={(e) =>
              setForm({
                ...form,
                connection_type: e.target.value,
                config_json: {},
              })
            }
            style={input}
          >
            <option value="EMAIL">EMAIL</option>
            <option value="SFTP">SFTP</option>
            <option value="AS2">AS2</option>
            <option value="API">API</option>
            <option value="VAN">VAN</option>
          </select>
        )}

        {field(
          "Direction",
          <select
            value={form.direction}
            onChange={(e) => setForm({ ...form, direction: e.target.value })}
            style={input}
          >
            <option value="INBOUND">INBOUND</option>
            <option value="OUTBOUND">OUTBOUND</option>
            <option value="BOTH">BOTH</option>
          </select>
        )}

        {field(
          "Message Type",
          <select
            value={form.message_type || "PO"}
            onChange={(e) => setForm({ ...form, message_type: e.target.value })}
            style={input}
          >
            <option value="PO">PO</option>
            <option value="ORDERS">ORDERS</option>
            <option value="ORDRSP">ORDRSP</option>
            <option value="ORDCHG">ORDCHG</option>
            <option value="DESADV">DESADV</option>
            <option value="INVOIC">INVOIC</option>
            <option value="850">850</option>
            <option value="810">810</option>
            <option value="ORDER_CONFIRMATION">Order Confirmation</option>
            <option value="ORDER_RESPONSE">Order Response</option>
            <option value="ORDER_CHANGE">Order Change</option>
            <option value="ASN">ASN</option>
            <option value="AP_INVOICE">AP Invoice</option>
            <option value="AR_INVOICE">AR Invoice</option>
            <option value="INVOICE">Invoice</option>
            <option value="DELFOR">Forecast</option>
          </select>
        )}
        <div style={{ gridColumn: "1 / -1", marginTop: -6, marginBottom: 6, fontSize: 12, color: "#64748b" }}>
          Use ERP-native values like ORDERS, ORDRSP, ORDCHG, DESADV, INVOIC, 810, AP_INVOICE, or AR_INVOICE to match the partner's supported message family.
        </div>

        {field(
          "Message Version",
          <input
            value={form.message_version || ""}
            onChange={(e) => setForm({ ...form, message_version: e.target.value })}
            style={input}
          />
        )}

        {field(
          "Status",
          <select
            value={form.is_active ? "ACTIVE" : "INACTIVE"}
            onChange={(e) =>
              setForm({ ...form, is_active: e.target.value === "ACTIVE" })
            }
            style={input}
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        )}

        {dynamicFields.map((f) =>
          field(
            f.label,
            <input
              key={f.key}
              type={f.type || "text"}
              value={form.config_json?.[f.key] || ""}
              placeholder={f.placeholder}
              onChange={(e) => updateConfig(f.key, e.target.value)}
              style={input}
            />
          )
        )}
      </div>

      <div style={buttonRow}>
        <button type="button" style={primaryButton} onClick={saveConnection} disabled={saving}>
          {saving ? "Saving..." : editingId ? "Update Connection" : "Save Connection"}
        </button>

        {editingId && form.connection_type === "EMAIL" ? (
          <button
            type="button"
            style={secondaryButton}
            onClick={() => {
              const row = rows.find((item) => String(item.connection_id) === editingId);
              if (row) void testConnection(row);
            }}
            disabled={actionBusyKey === `test:${editingId}`}
          >
            {actionBusyKey === `test:${editingId}` ? "Testing..." : "Test Connection"}
          </button>
        ) : null}

        {editingId ? (
          <button type="button" style={secondaryButton} onClick={resetForm}>
            Cancel
          </button>
        ) : null}
      </div>

      <div style={{ overflowX: "auto", marginTop: 18 }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Direction</th>
              <th style={thStyle}>Message</th>
              <th style={thStyle}>Connection Details</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={tdEmptyStyle}>
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={tdEmptyStyle}>
                  No connections configured.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r.connection_id)}>
                  <td style={tdStyle}>{r.connection_name}</td>
                  <td style={tdStyle}>{r.connection_type}</td>
                  <td style={tdStyle}>{r.direction}</td>
                  <td style={tdStyle}>
                    {r.message_type || "-"} {r.message_version ? `(${r.message_version})` : ""}
                  </td>
                  <td style={tdStyle}>{getConnectionDetails(r)}</td>
                  <td style={tdStyle}>{r.is_active ? "ACTIVE" : "INACTIVE"}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" style={miniButton} onClick={() => editRow(r)}>
                        Edit
                      </button>
                      {r.connection_type === "EMAIL" ? (
                        <button
                          type="button"
                          style={miniButton}
                          onClick={() => void testConnection(r)}
                          disabled={actionBusyKey === `test:${r.connection_id}`}
                        >
                          {actionBusyKey === `test:${r.connection_id}` ? "Testing..." : "Test"}
                        </button>
                      ) : null}
                      {r.connection_type === "EMAIL" ? (
                        <button
                          type="button"
                          style={miniButton}
                          onClick={() => void pollConnection(r)}
                          disabled={actionBusyKey === `poll:${r.connection_id}`}
                        >
                          {actionBusyKey === `poll:${r.connection_id}` ? "Polling..." : "Poll Now"}
                        </button>
                      ) : null}
                      <button type="button" style={miniButton} onClick={() => toggleActive(r)}>
                        {r.is_active ? "Deactivate" : "Activate"}
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

function field(label: string, child: React.ReactNode) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      {child}
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
  marginBottom: 14,
};

const title: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "#0f172a",
};

const subTitle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginTop: 4,
};

const grid: React.CSSProperties = {
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

const input: React.CSSProperties = {
  width: "100%",
  minHeight: 38,
  padding: "8px 10px",
  borderRadius: 8,
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
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const miniButton: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

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
