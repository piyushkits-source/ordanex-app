import React, { useEffect, useState } from "react";
import { TradingPartner } from "types/tradingPartner";

const API_BASE = "/parser-profiles";

type ParserProfileRow = {
  parser_profile_id?: string;
  client_id: string;
  partner_id: string;
  profile_name: string;
  source_format?: string | null;
  source_message_type?: string | null;
  source_version?: string | null;
  parser_config_json?: Record<string, any> | null;
  field_mapping_json?: Record<string, any> | null;
  is_active: boolean;
  priority: number;
};

function defaultProfile(partner: TradingPartner): ParserProfileRow {
  return {
    client_id: partner.client_id,
    partner_id: String(partner.partner_id),
    profile_name: "",
    source_format: "X12",
    source_message_type: "850",
    source_version: "4010",
    parser_config_json: {
      version: "4010",
      element_separator: "*",
      segment_separator: "~",
    },
    field_mapping_json: {
      product_qualifiers: {
        buyer: "BP",
        supplier: "VP",
      },
    },
    is_active: true,
    priority: 100,
  };
}

export default function ParserProfilesSection({
  partner,
  onBanner,
}: {
  partner: TradingPartner;
  onBanner: (text: string) => void;
}) {
  const [rows, setRows] = useState<ParserProfileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<ParserProfileRow>(defaultProfile(partner));
  const [parserConfigText, setParserConfigText] = useState(
    JSON.stringify(defaultProfile(partner).parser_config_json, null, 2)
  );
  const [fieldMappingText, setFieldMappingText] = useState(
    JSON.stringify(defaultProfile(partner).field_mapping_json, null, 2)
  );

  useEffect(() => {
    const next = defaultProfile(partner);
    setForm(next);
    setParserConfigText(JSON.stringify(next.parser_config_json, null, 2));
    setFieldMappingText(JSON.stringify(next.field_mapping_json, null, 2));
    void loadRows();
  }, [partner.partner_id]);

  async function loadRows() {
    try {
      setLoading(true);
      const res = await fetch(
        `${API_BASE}/?partner_id=${encodeURIComponent(String(partner.partner_id))}`,
        { method: "GET" }
      );

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      onBanner(err?.message || "Failed to load parser profiles.");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    try {
      setSaving(true);

      if (!form.profile_name.trim()) {
        onBanner("Profile Name is required.");
        return;
      }

      let parserConfigJson: Record<string, any> | null = null;
      let fieldMappingJson: Record<string, any> | null = null;

      try {
        parserConfigJson = parserConfigText.trim() ? JSON.parse(parserConfigText) : null;
      } catch {
        throw new Error("Parser Config JSON is invalid.");
      }

      try {
        fieldMappingJson = fieldMappingText.trim() ? JSON.parse(fieldMappingText) : null;
      } catch {
        throw new Error("Field Mapping JSON is invalid.");
      }

      const payload = {
        ...form,
        client_id: partner.client_id,
        partner_id: partner.partner_id,
        parser_config_json: parserConfigJson,
        field_mapping_json: fieldMappingJson,
        source_format: nullable(form.source_format),
        source_message_type: nullable(form.source_message_type),
        source_version: nullable(form.source_version),
      };

      const endpoint = form.parser_profile_id
        ? `${API_BASE}/${form.parser_profile_id}`
        : `${API_BASE}/`;

      const method = form.parser_profile_id ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      onBanner(
        form.parser_profile_id
          ? "Parser profile updated successfully."
          : "Parser profile created successfully."
      );

      resetForm();
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to save parser profile.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProfile(parserProfileId?: string) {
    try {
      if (!parserProfileId) return;
      if (!window.confirm("Delete this parser profile?")) return;

      const res = await fetch(`${API_BASE}/${parserProfileId}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(await res.text());
      }

      onBanner("Parser profile deleted successfully.");
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to delete parser profile.");
    }
  }

  function editRow(row: ParserProfileRow) {
    setForm({
      ...row,
      source_format: row.source_format || "",
      source_message_type: row.source_message_type || "",
      source_version: row.source_version || "",
    });
    setParserConfigText(JSON.stringify(row.parser_config_json || {}, null, 2));
    setFieldMappingText(JSON.stringify(row.field_mapping_json || {}, null, 2));
  }

  function resetForm() {
    const next = defaultProfile(partner);
    setForm(next);
    setParserConfigText(JSON.stringify(next.parser_config_json, null, 2));
    setFieldMappingText(JSON.stringify(next.field_mapping_json, null, 2));
  }

  return (
    <div style={page}>
      <div style={title}>Parser Profiles</div>
      <div style={subTitle}>
        Configure partner-specific parser behavior for PDF, X12, EDIFACT, XML, JSON, and Excel.
        Use profile JSON to control separators, version logic, and qualifier mapping.
      </div>

      <div style={card}>
        <div style={sectionTitle}>Parser Profile Setup</div>

        <div style={grid4}>
          {field(
            "Profile Name",
            <input
              style={input}
              value={form.profile_name}
              onChange={(e) => setForm({ ...form, profile_name: e.target.value })}
              placeholder="e.g. Walmart X12 850 4010"
            />
          )}

          {field(
            "Source Format",
            <select
              style={input}
              value={form.source_format || ""}
              onChange={(e) => setForm({ ...form, source_format: e.target.value })}
            >
              <option value="PDF">PDF</option>
              <option value="EXCEL">EXCEL</option>
              <option value="JSON">JSON</option>
              <option value="XML">XML</option>
              <option value="X12">X12</option>
              <option value="EDIFACT">EDIFACT</option>
            </select>
          )}

          {field(
            "Message Type",
            <input
              style={input}
              value={form.source_message_type || ""}
              onChange={(e) => setForm({ ...form, source_message_type: e.target.value })}
              placeholder="e.g. 850 / ORDERS"
            />
          )}

          {field(
            "Version",
            <input
              style={input}
              value={form.source_version || ""}
              onChange={(e) => setForm({ ...form, source_version: e.target.value })}
              placeholder="e.g. 4010 / 5010 / D96A"
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
            "Active",
            <label style={checkboxLabel}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <span>{form.is_active ? "Enabled" : "Disabled"}</span>
            </label>
          )}
        </div>

        <div style={jsonGrid}>
          <div>
            <div style={labelStyle}>Parser Config JSON</div>
            <textarea
              style={textarea}
              value={parserConfigText}
              onChange={(e) => setParserConfigText(e.target.value)}
              placeholder='{"version":"4010","element_separator":"*","segment_separator":"~"}'
            />
          </div>

          <div>
            <div style={labelStyle}>Field Mapping JSON</div>
            <textarea
              style={textarea}
              value={fieldMappingText}
              onChange={(e) => setFieldMappingText(e.target.value)}
              placeholder='{"product_qualifiers":{"buyer":"BP","supplier":"VP"}}'
            />
          </div>
        </div>

        <div style={helperBox}>
          <div style={helperTitle}>Examples</div>
          <div style={helperText}>
            X12 example:
            <code style={codeBlock}>
              {`{"version":"4010","element_separator":"*","segment_separator":"~"}`}
            </code>
          </div>
          <div style={helperText}>
            EDIFACT example:
            <code style={codeBlock}>
              {`{"version":"D96A","element_separator":"+","segment_separator":"'","component_separator":":"}`}
            </code>
          </div>
          <div style={helperText}>
            Product qualifier mapping:
            <code style={codeBlock}>
              {`{"product_qualifiers":{"buyer":"BP","supplier":"VP"}}`}
            </code>
          </div>
        </div>

        <div style={buttonRow}>
          <button type="button" style={primaryButton} onClick={saveProfile} disabled={saving}>
            {form.parser_profile_id ? "Update Profile" : "Save Profile"}
          </button>
          <button type="button" style={secondaryButton} onClick={resetForm} disabled={saving}>
            Reset
          </button>
        </div>
      </div>

      <div style={card}>
        <div style={sectionTitle}>Configured Parser Profiles</div>

        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Profile</th>
                <th style={thStyle}>Format</th>
                <th style={thStyle}>Message</th>
                <th style={thStyle}>Version</th>
                <th style={thStyle}>Priority</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={tdEmptyStyle}>Loading...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={tdEmptyStyle}>No parser profiles configured.</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.parser_profile_id}>
                    <td style={tdStyle}>{row.profile_name}</td>
                    <td style={tdStyle}>{row.source_format || "-"}</td>
                    <td style={tdStyle}>{row.source_message_type || "-"}</td>
                    <td style={tdStyle}>{row.source_version || "-"}</td>
                    <td style={tdStyle}>{row.priority}</td>
                    <td style={tdStyle}>{row.is_active ? "ACTIVE" : "INACTIVE"}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" style={miniButton} onClick={() => editRow(row)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          style={dangerMiniButton}
                          onClick={() => void deleteProfile(row.parser_profile_id)}
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

const jsonGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
  marginBottom: 14,
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

const textarea: React.CSSProperties = {
  width: "100%",
  minHeight: 180,
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #dbe4ee",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  resize: "vertical",
};

const checkboxLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 38,
  fontSize: 13,
  color: "#334155",
};

const helperBox: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: 10,
  background: "#f8fafc",
  padding: 12,
  marginBottom: 14,
};

const helperTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#334155",
  marginBottom: 8,
};

const helperText: React.CSSProperties = {
  fontSize: 12,
  color: "#475569",
  marginBottom: 8,
};

const codeBlock: React.CSSProperties = {
  display: "block",
  marginTop: 4,
  padding: "8px 10px",
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
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