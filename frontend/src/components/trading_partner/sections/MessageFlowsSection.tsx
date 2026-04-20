import React, { useEffect, useState } from "react";
import { TradingPartner } from "types/tradingPartner";

const API_BASE = "/message-flows";

type MessageFlowRow = {
  flow_id?: string;
  client_id: string;
  vertical_id?: string | null;
  partner_id: string;

  flow_name: string;
  is_active: boolean;
  priority: number;

  document_type: string;
  message_direction: "INBOUND" | "OUTBOUND";

  source_format: string;
  source_message_standard?: string | null;
  source_message_type?: string | null;
  source_message_version?: string | null;

  target_erp: string;
  target_message_standard?: string | null;
  target_message_type?: string | null;
  target_message_version?: string | null;

  target_connection_id?: string | null;

  mapping_profile_id?: string | null;
  rule_profile_id?: string | null;
  uom_profile_id?: string | null;
  address_profile_id?: string | null;
  parser_profile_id?: string | null;
  validation_profile_id?: string | null;

  auto_send_on_success: boolean;
  requires_review_on_error: boolean;
  allow_partial_processing: boolean;
};

function defaultFlow(partner: TradingPartner): MessageFlowRow {
  return {
    client_id: partner.client_id,
    vertical_id: (partner as any).vertical_id || null,
    partner_id: partner.partner_id,

    flow_name: "",
    is_active: true,
    priority: 100,

    document_type: "PO",
    message_direction: "INBOUND",

    source_format: "PDF",
    source_message_standard: "",
    source_message_type: "",
    source_message_version: "",

    target_erp: "SAP",
    target_message_standard: "IDOC",
    target_message_type: "ORDERS",
    target_message_version: "ORDERS05",

    target_connection_id: "",
    mapping_profile_id: "",
    rule_profile_id: "",
    uom_profile_id: "",
    address_profile_id: "",
    parser_profile_id: "",
    validation_profile_id: "",

    auto_send_on_success: true,
    requires_review_on_error: true,
    allow_partial_processing: false,
  };
}

export default function MessageFlowsSection({
  partner,
  onBanner,
}: {
  partner: TradingPartner;
  onBanner: (text: string) => void;
}) {
  const [rows, setRows] = useState<MessageFlowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<MessageFlowRow>(defaultFlow(partner));

  useEffect(() => {
    setForm(defaultFlow(partner));
    void loadRows();
  }, [partner.partner_id]);

  async function loadRows() {
    try {
      setLoading(true);

      const res = await fetch(
        `${API_BASE}?partner_id=${encodeURIComponent(partner.partner_id)}`,
        { method: "GET" }
      );

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      onBanner(err?.message || "Failed to load message flows.");
    } finally {
      setLoading(false);
    }
  }

  async function saveFlow() {
    try {
      setSaving(true);

      if (!form.flow_name.trim()) {
        onBanner("Flow Name is required.");
        return;
      }

      const payload = {
        ...form,
        client_id: partner.client_id,
        partner_id: partner.partner_id,
        vertical_id: form.vertical_id || (partner as any).vertical_id || null,
        source_message_standard: nullable(form.source_message_standard),
        source_message_type: nullable(form.source_message_type),
        source_message_version: nullable(form.source_message_version),
        target_message_standard: nullable(form.target_message_standard),
        target_message_type: nullable(form.target_message_type),
        target_message_version: nullable(form.target_message_version),
        target_connection_id: nullable(form.target_connection_id),
        mapping_profile_id: nullable(form.mapping_profile_id),
        rule_profile_id: nullable(form.rule_profile_id),
        uom_profile_id: nullable(form.uom_profile_id),
        address_profile_id: nullable(form.address_profile_id),
        parser_profile_id: nullable(form.parser_profile_id),
        validation_profile_id: nullable(form.validation_profile_id),
      };

      const endpoint = form.flow_id ? `${API_BASE}/${form.flow_id}` : API_BASE;
      const method = form.flow_id ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      onBanner(form.flow_id ? "Message flow updated successfully." : "Message flow created successfully.");
      setForm(defaultFlow(partner));
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to save message flow.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteFlow(flowId?: string) {
    try {
      if (!flowId) return;
      if (!window.confirm("Delete this message flow?")) return;

      const res = await fetch(`${API_BASE}/${flowId}`, { method: "DELETE" });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      onBanner("Message flow deleted successfully.");
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to delete message flow.");
    }
  }

  function loadIntoForm(row: MessageFlowRow) {
    setForm({
      ...defaultFlow(partner),
      ...row,
      target_connection_id: row.target_connection_id || "",
      mapping_profile_id: row.mapping_profile_id || "",
      rule_profile_id: row.rule_profile_id || "",
      uom_profile_id: row.uom_profile_id || "",
      address_profile_id: row.address_profile_id || "",
      parser_profile_id: row.parser_profile_id || "",
      validation_profile_id: row.validation_profile_id || "",
      source_message_standard: row.source_message_standard || "",
      source_message_type: row.source_message_type || "",
      source_message_version: row.source_message_version || "",
      target_message_standard: row.target_message_standard || "",
      target_message_type: row.target_message_type || "",
      target_message_version: row.target_message_version || "",
    });
  }

  return (
    <div style={page}>
      <div style={title}>Message Flows</div>
      <div style={subTitle}>
        Configure client-specific execution flows by combining document type, source format, target ERP/message version,
        connection, and reusable setup references like mapping, rules, UOM, address, parser, and validation profiles.
      </div>

      <div style={card}>
        <div style={sectionTitle}>Flow Definition</div>

        <div style={grid4}>
          {field(
            "Flow Name",
            <input
              style={input}
              value={form.flow_name}
              onChange={(e) => setForm({ ...form, flow_name: e.target.value })}
              placeholder="e.g. PO PDF to SAP ORDERS05"
            />
          )}

          {field(
            "Priority",
            <input
              type="number"
              style={input}
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: Number(e.target.value || 0) })}
            />
          )}

          {field(
            "Document Type",
            <select
              style={input}
              value={form.document_type}
              onChange={(e) => setForm({ ...form, document_type: e.target.value })}
            >
              <option value="PO">PO</option>
              <option value="ORDER_RESPONSE">ORDER_RESPONSE</option>
              <option value="ORDER_CHANGE">ORDER_CHANGE</option>
              <option value="ASN">ASN</option>
              <option value="INVOICE">INVOICE</option>
            </select>
          )}

          {field(
            "Direction",
            <select
              style={input}
              value={form.message_direction}
              onChange={(e) =>
                setForm({ ...form, message_direction: e.target.value as "INBOUND" | "OUTBOUND" })
              }
            >
              <option value="INBOUND">INBOUND</option>
              <option value="OUTBOUND">OUTBOUND</option>
            </select>
          )}
        </div>

        <div style={sectionTitle}>Source Definition</div>
        <div style={grid4}>
          {field(
            "Source Format",
            <select
              style={input}
              value={form.source_format}
              onChange={(e) => setForm({ ...form, source_format: e.target.value })}
            >
              <option value="PDF">PDF</option>
              <option value="EXCEL">EXCEL</option>
              <option value="CSV">CSV</option>
              <option value="X12">X12</option>
              <option value="EDIFACT">EDIFACT</option>
              <option value="XML">XML</option>
              <option value="JSON">JSON</option>
              <option value="API">API</option>
            </select>
          )}

          {field(
            "Source Standard",
            <input
              style={input}
              value={form.source_message_standard || ""}
              onChange={(e) => setForm({ ...form, source_message_standard: e.target.value })}
              placeholder="e.g. X12 / EDIFACT / IDOC"
            />
          )}

          {field(
            "Source Message Type",
            <input
              style={input}
              value={form.source_message_type || ""}
              onChange={(e) => setForm({ ...form, source_message_type: e.target.value })}
              placeholder="e.g. 850 / ORDERS / DESADV"
            />
          )}

          {field(
            "Source Version",
            <input
              style={input}
              value={form.source_message_version || ""}
              onChange={(e) => setForm({ ...form, source_message_version: e.target.value })}
              placeholder="e.g. 4010 / 5010 / D.97A"
            />
          )}
        </div>

        <div style={sectionTitle}>Target Definition</div>
        <div style={grid4}>
          {field(
            "Target ERP",
            <select
              style={input}
              value={form.target_erp}
              onChange={(e) => setForm({ ...form, target_erp: e.target.value })}
            >
              <option value="SAP">SAP</option>
              <option value="ORACLE">ORACLE</option>
              <option value="D365">D365</option>
              <option value="NETSUITE">NETSUITE</option>
              <option value="GENERIC">GENERIC</option>
            </select>
          )}

          {field(
            "Target Standard",
            <input
              style={input}
              value={form.target_message_standard || ""}
              onChange={(e) => setForm({ ...form, target_message_standard: e.target.value })}
              placeholder="e.g. IDOC / API / XML / JSON"
            />
          )}

          {field(
            "Target Message Type",
            <input
              style={input}
              value={form.target_message_type || ""}
              onChange={(e) => setForm({ ...form, target_message_type: e.target.value })}
              placeholder="e.g. ORDERS / SalesOrder / XML_ORDER"
            />
          )}

          {field(
            "Target Version",
            <input
              style={input}
              value={form.target_message_version || ""}
              onChange={(e) => setForm({ ...form, target_message_version: e.target.value })}
              placeholder="e.g. ORDERS03 / ORDERS05 / v1"
            />
          )}
        </div>

        <div style={sectionTitle}>Referenced Setup Profiles</div>
        <div style={grid4}>
          {field(
            "Connection ID",
            <input
              style={input}
              value={form.target_connection_id || ""}
              onChange={(e) => setForm({ ...form, target_connection_id: e.target.value })}
              placeholder="Existing connection record ID"
            />
          )}

          {field(
            "Mapping Profile ID",
            <input
              style={input}
              value={form.mapping_profile_id || ""}
              onChange={(e) => setForm({ ...form, mapping_profile_id: e.target.value })}
              placeholder="Existing mapping profile ID"
            />
          )}

          {field(
            "Rule Profile ID",
            <input
              style={input}
              value={form.rule_profile_id || ""}
              onChange={(e) => setForm({ ...form, rule_profile_id: e.target.value })}
              placeholder="Existing rules profile ID"
            />
          )}

          {field(
            "UOM Profile ID",
            <input
              style={input}
              value={form.uom_profile_id || ""}
              onChange={(e) => setForm({ ...form, uom_profile_id: e.target.value })}
              placeholder="Existing UOM profile ID"
            />
          )}

          {field(
            "Address Profile ID",
            <input
              style={input}
              value={form.address_profile_id || ""}
              onChange={(e) => setForm({ ...form, address_profile_id: e.target.value })}
              placeholder="Existing address profile ID"
            />
          )}

          {field(
            "Parser Profile ID",
            <input
              style={input}
              value={form.parser_profile_id || ""}
              onChange={(e) => setForm({ ...form, parser_profile_id: e.target.value })}
              placeholder="Existing parser profile ID"
            />
          )}

          {field(
            "Validation Profile ID",
            <input
              style={input}
              value={form.validation_profile_id || ""}
              onChange={(e) => setForm({ ...form, validation_profile_id: e.target.value })}
              placeholder="Existing validation profile ID"
            />
          )}
        </div>

        <div style={sectionTitle}>Runtime Behavior</div>
        <div style={toggleRow}>
          {toggleField(
            "Active",
            form.is_active,
            (value) => setForm({ ...form, is_active: value })
          )}
          {toggleField(
            "Auto Send on Success",
            form.auto_send_on_success,
            (value) => setForm({ ...form, auto_send_on_success: value })
          )}
          {toggleField(
            "Review on Error",
            form.requires_review_on_error,
            (value) => setForm({ ...form, requires_review_on_error: value })
          )}
          {toggleField(
            "Allow Partial Processing",
            form.allow_partial_processing,
            (value) => setForm({ ...form, allow_partial_processing: value })
          )}
        </div>

        <div style={buttonRow}>
          <button type="button" style={primaryButton} onClick={saveFlow} disabled={saving}>
            {form.flow_id ? "Update Flow" : "Save Flow"}
          </button>

          <button
            type="button"
            style={secondaryButton}
            onClick={() => setForm(defaultFlow(partner))}
            disabled={saving}
          >
            Reset
          </button>
        </div>
      </div>

      <div style={card}>
        <div style={sectionTitle}>Configured Message Flows</div>

        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Flow</th>
                <th style={thStyle}>Doc / Dir</th>
                <th style={thStyle}>Source</th>
                <th style={thStyle}>Target</th>
                <th style={thStyle}>Connection</th>
                <th style={thStyle}>Priority</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={tdEmptyStyle}>Loading...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={tdEmptyStyle}>No message flows configured.</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.flow_id}>
                    <td style={tdStyle}>{row.flow_name}</td>
                    <td style={tdStyle}>
                      {row.document_type} / {row.message_direction}
                    </td>
                    <td style={tdStyle}>
                      {[
                        row.source_format,
                        row.source_message_standard,
                        row.source_message_type,
                        row.source_message_version,
                      ]
                        .filter(Boolean)
                        .join(" / ")}
                    </td>
                    <td style={tdStyle}>
                      {[
                        row.target_erp,
                        row.target_message_standard,
                        row.target_message_type,
                        row.target_message_version,
                      ]
                        .filter(Boolean)
                        .join(" / ")}
                    </td>
                    <td style={tdStyle}>{row.target_connection_id || "-"}</td>
                    <td style={tdStyle}>{row.priority}</td>
                    <td style={tdStyle}>{row.is_active ? "ACTIVE" : "INACTIVE"}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          style={miniButton}
                          onClick={() => loadIntoForm(row)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          style={dangerMiniButton}
                          onClick={() => void deleteFlow(row.flow_id)}
                        >
                          Delete
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
    </div>
  );
}

function nullable(value: any) {
  const v = String(value || "").trim();
  return v === "" ? null : v;
}

function field(label: string, child: React.ReactNode) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      {child}
    </div>
  );
}

function toggleField(label: string, value: boolean, onChange: (value: boolean) => void) {
  return (
    <label style={toggleLabel}>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

const page: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  minWidth: 0,
};

const title: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: "#0f172a",
};

const subTitle: React.CSSProperties = {
  fontSize: 13,
  color: "#64748b",
  marginTop: -6,
};

const card: React.CSSProperties = {
  border: "1px solid #eef2f7",
  borderRadius: 12,
  background: "#fff",
  padding: 16,
  minWidth: 0,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "#334155",
  marginBottom: 10,
  marginTop: 4,
};

const grid4: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
  marginBottom: 14,
};

const toggleRow: React.CSSProperties = {
  display: "flex",
  gap: 20,
  flexWrap: "wrap",
  marginBottom: 14,
};

const toggleLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: "#334155",
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
  boxSizing: "border-box",
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
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
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const dangerMiniButton: React.CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: 8,
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