import React, { useEffect, useState } from "react";
import { apiFetch, parseApiError } from "utils/api";
import { TradingPartner } from "types/tradingPartner";

const API_BASE = "/trading-partners";

type MappingProfileForm = {
  profile_name: string;
  document_type: string;
  input_format: string;
  target_message_family: string;
  target_erp: string;
  target_standard: string;
  target_message_type: string;
  target_message_version: string;
  transaction_id_source: string;
  customization_required: boolean;
  customization_notes: string;
  field_mapping_json: Record<string, any>;
  header_defaults_json: Record<string, any>;
  line_mapping_json: Record<string, any>;
  layout_hint_json: Record<string, any>;
  validation_json: Record<string, any>;
};

const defaultForm: MappingProfileForm = {
  profile_name: "",
  document_type: "PO",
  input_format: "PDF",
  target_message_family: "ORDER",
  target_erp: "SAP",
  target_standard: "IDOC",
  target_message_type: "ORDERS",
  target_message_version: "ORDERS05",
  transaction_id_source: "document_number",
  customization_required: false,
  customization_notes: "",
  field_mapping_json: {},
  header_defaults_json: {},
  line_mapping_json: {},
  layout_hint_json: {},
  validation_json: {},
};

const HEADER_TARGET_OPTIONS = [
  "document_number",
  "document_date",
  "currency_code",
  "doc_type",
  "order_type",
  "sold_to_code",
  "ship_to_code",
  "supplier_code",
  "buyer_name",
  "seller_name",
  "ship_to_name",
  "customer_account",
  "delivery_account",
  "delivery_name",
  "header_text",
  "header_text_id",
  "line_text_id",
];

const LINE_TARGET_OPTIONS = [
  "line_number",
  "item_code",
  "item_number",
  "buyer_product_code",
  "supplier_product_code",
  "internal_material_code",
  "description",
  "ordered_quantity",
  "ordered_uom",
  "requested_delivery_date",
  "unit_price",
  "currency_code",
  "plant_code",
];

const HEADER_SOURCE_OPTIONS = [
  "header.document_number",
  "header.document_date",
  "header.currency_code",
  "header.buyer_order_type",
  "header.seller_order_type",
  "header.notes",
  "parties.buyer.partner_code",
  "parties.buyer.partner_name",
  "parties.seller.partner_code",
  "parties.seller.partner_name",
  "parties.ship_to.partner_code",
  "parties.ship_to.partner_name",
];

const LINE_SOURCE_OPTIONS = [
  "item.line_number",
  "item.buyer_product_code",
  "item.supplier_product_code",
  "item.internal_material_code",
  "item.description",
  "item.ordered_quantity",
  "item.ordered_uom",
  "item.requested_delivery_date",
  "item.unit_price",
  "item.currency_code",
  "item.plant_code",
];

export default function MappingProfilesSection({
  partner,
  onBanner,
}: {
  partner: TradingPartner;
  onBanner: (text: string) => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<MappingProfileForm>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadRows();
  }, [partner.partner_id]);

  async function loadRows() {
    try {
      setLoading(true);
      const res = await apiFetch(`${API_BASE}/${partner.partner_id}/mapping-profiles`, { method: "GET" });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      const nextRows = Array.isArray(data) ? data : [];
      setRows(nextRows);
    } catch (err: any) {
      onBanner(err?.message || "Failed to load mapping profiles.");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    try {
      setSaving(true);
      const payload = {
        profile_name: form.profile_name,
        document_type: form.document_type,
        input_format: form.input_format,
        field_mapping_json: form.field_mapping_json,
        header_defaults_json: form.header_defaults_json,
        line_mapping_json: form.line_mapping_json,
        validation_json: form.validation_json,
        layout_hint_json: {
          ...(form.layout_hint_json || {}),
          message_control: buildMessageControlPayload(),
          target_profile: {
            target_message_family: form.target_message_family,
            target_erp: form.target_erp,
            target_standard: form.target_standard,
            target_message_type: form.target_message_type,
            target_message_version: form.target_message_version,
            transaction_id_source: form.transaction_id_source,
          },
          customization: {
            required: form.customization_required,
            notes: form.customization_notes,
          },
        },
        client_id: partner.client_id,
        partner_id: partner.partner_id,
      };

      const res = await apiFetch(`${API_BASE}/${partner.partner_id}/mapping-profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await parseApiError(res));

      onBanner("Mapping profile created successfully.");
      setForm(defaultForm);
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to save mapping profile.");
    } finally {
      setSaving(false);
    }
  }

  function parseJSON(value: string) {
    try {
      return JSON.parse(value || "{}");
    } catch {
      return {};
    }
  }

  function setObjectEntry(
    key: "field_mapping_json" | "line_mapping_json",
    oldKey: string,
    nextKey: string,
    nextValue: string
  ) {
    setForm((current) => {
      const nextObject = { ...(current[key] || {}) };
      if (oldKey && oldKey !== nextKey) {
        delete nextObject[oldKey];
      }
      if (nextKey.trim()) {
        nextObject[nextKey.trim()] = nextValue;
      }
      return { ...current, [key]: nextObject };
    });
  }

  function removeObjectEntry(key: "field_mapping_json" | "line_mapping_json", targetKey: string) {
    setForm((current) => {
      const nextObject = { ...(current[key] || {}) };
      delete nextObject[targetKey];
      return { ...current, [key]: nextObject };
    });
  }


  function buildMessageControlPayload() {
    const current: any = form.layout_hint_json || {};
    const value = current.message_control || {};
    return {
      horizon_mode: value.horizon_mode || "",
      horizon_value: value.horizon_value || "",
      horizon_anchor_field: value.horizon_anchor_field || "",
      firm_indicators: value.firm_indicators || "",
      forecast_indicators: value.forecast_indicators || "",
      no_indicator_policy: value.no_indicator_policy || "",
      compare_fields: value.compare_fields || "",
      zero_quantity_action: value.zero_quantity_action || "",
      missing_line_action: value.missing_line_action || "",
      outside_horizon_action: value.outside_horizon_action || "",
      forecast_action: value.forecast_action || "",
      forecast_email_subject: value.forecast_email_subject || "",
      forecast_email_body_html: value.forecast_email_body_html || "",
    };
  }

  function setHeaderDefault(field: "header_text_id" | "line_text_id", value: string) {
    setForm((current) => ({
      ...current,
      header_defaults_json: {
        ...(current.header_defaults_json || {}),
        [field]: value,
      },
    }));
  }

  return (
    <div style={wrap}>
      <div style={headerRow}>
        <div>
          <div style={title}>Mapping Profiles</div>
          <div style={subtitle}>
            Define reusable mapping blueprints by document type and input format so partner message transformations stay consistent.
          </div>
        </div>
        <div style={modePill}>Reusable Profiles</div>
      </div>

      <div style={card}>
        <div style={sectionLabel}>Profile Definition</div>
        <div style={heroGrid}>
          {field(
            "Profile Name",
            <input
              style={input}
              value={form.profile_name}
              onChange={(e) => setForm({ ...form, profile_name: e.target.value })}
              placeholder="e.g. Paper PO Default"
            />
          )}

          {field(
            "Document Type",
            <select
              style={input}
              value={form.document_type}
              onChange={(e) => setForm({ ...form, document_type: e.target.value })}
            >
              <option>PO</option>
              <option>ASN</option>
              <option>INVOICE</option>
            </select>
          )}

          {field(
            "Input Format",
            <select
              style={input}
              value={form.input_format}
              onChange={(e) => setForm({ ...form, input_format: e.target.value })}
            >
              <option>PDF</option>
              <option>EXCEL</option>
              <option>EDI</option>
              <option>XML</option>
            </select>
          )}
        </div>

        <div style={heroGrid}>
          {field(
            "Target Message Family",
            <input
              style={input}
              value={form.target_message_family}
              onChange={(e) => setForm({ ...form, target_message_family: e.target.value })}
              placeholder="e.g. ORDER / ASN / INVOICE / ORDER_RESPONSE"
            />
          )}

          {field(
            "Target ERP",
            <select
              style={input}
              value={form.target_erp}
              onChange={(e) => setForm({ ...form, target_erp: e.target.value })}
            >
              <option>SAP</option>
              <option>ORACLE</option>
              <option>D365</option>
              <option>JDE</option>
              <option>API</option>
            </select>
          )}

          {field(
            "Target Standard",
            <input
              style={input}
              value={form.target_standard}
              onChange={(e) => setForm({ ...form, target_standard: e.target.value })}
              placeholder="e.g. IDOC / XML / JSON / API"
            />
          )}

          {field(
            "Target Message Type",
            <input
              style={input}
              value={form.target_message_type}
              onChange={(e) => setForm({ ...form, target_message_type: e.target.value })}
              placeholder="e.g. ORDERS"
            />
          )}
        </div>



        <div style={builderCard}>
          <div style={detailTitle}>Message Control</div>
          <div style={helperText}>
            Configure firm / forecast detection, horizon comparison, and change / cancel handling without writing code.
          </div>
          <div style={heroGrid}>
            {field(
              "Horizon Mode",
              <select style={input} value={(form.layout_hint_json as any)?.message_control?.horizon_mode || ""} onChange={(e) => setForm((current) => ({ ...current, layout_hint_json: { ...(current.layout_hint_json || {}), message_control: { ...((current.layout_hint_json || {}) as any)?.message_control, horizon_mode: e.target.value } } }))}>
                <option value="">Select</option>
                <option>ROLLING_DAYS</option>
                <option>RELATIVE_MONTHS</option>
                <option>ABSOLUTE_DATE</option>
              </select>
            )}
            {field(
              "Horizon Value",
              <input style={input} value={(form.layout_hint_json as any)?.message_control?.horizon_value || ""} onChange={(e) => setForm((current) => ({ ...current, layout_hint_json: { ...(current.layout_hint_json || {}), message_control: { ...((current.layout_hint_json || {}) as any)?.message_control, horizon_value: e.target.value } } }))} placeholder="e.g. 90 or 3" />
            )}
            {field(
              "Horizon Anchor Field",
              <input style={input} value={(form.layout_hint_json as any)?.message_control?.horizon_anchor_field || "requested_delivery_date"} onChange={(e) => setForm((current) => ({ ...current, layout_hint_json: { ...(current.layout_hint_json || {}), message_control: { ...((current.layout_hint_json || {}) as any)?.message_control, horizon_anchor_field: e.target.value } } }))} placeholder="requested_delivery_date" />
            )}
          </div>
          <div style={heroGrid}>
            {field(
              "Firm Indicators",
              <input style={input} value={(form.layout_hint_json as any)?.message_control?.firm_indicators || ""} onChange={(e) => setForm((current) => ({ ...current, layout_hint_json: { ...(current.layout_hint_json || {}), message_control: { ...((current.layout_hint_json || {}) as any)?.message_control, firm_indicators: e.target.value } } }))} placeholder="FIRM, FIXED, CONFIRMED" />
            )}
            {field(
              "Forecast Indicators",
              <input style={input} value={(form.layout_hint_json as any)?.message_control?.forecast_indicators || ""} onChange={(e) => setForm((current) => ({ ...current, layout_hint_json: { ...(current.layout_hint_json || {}), message_control: { ...((current.layout_hint_json || {}) as any)?.message_control, forecast_indicators: e.target.value } } }))} placeholder="FORECAST, FCST, ESTIMATED" />
            )}
            {field(
              "No Indicator Policy",
              <select style={input} value={(form.layout_hint_json as any)?.message_control?.no_indicator_policy || ""} onChange={(e) => setForm((current) => ({ ...current, layout_hint_json: { ...(current.layout_hint_json || {}), message_control: { ...((current.layout_hint_json || {}) as any)?.message_control, no_indicator_policy: e.target.value } } }))}>
                <option value="">Select</option>
                <option>USE_HORIZON</option>
                <option>TREAT_AS_FIRM</option>
                <option>TREAT_AS_FORECAST</option>
              </select>
            )}
          </div>
          <div style={heroGrid}>
            {field(
              "Compare Fields",
              <input style={input} value={(form.layout_hint_json as any)?.message_control?.compare_fields || ""} onChange={(e) => setForm((current) => ({ ...current, layout_hint_json: { ...(current.layout_hint_json || {}), message_control: { ...((current.layout_hint_json || {}) as any)?.message_control, compare_fields: e.target.value } } }))} placeholder="material_code, requested_delivery_date, quantity" />
            )}
            {field(
              "Zero Quantity Action",
              <select style={input} value={(form.layout_hint_json as any)?.message_control?.zero_quantity_action || ""} onChange={(e) => setForm((current) => ({ ...current, layout_hint_json: { ...(current.layout_hint_json || {}), message_control: { ...((current.layout_hint_json || {}) as any)?.message_control, zero_quantity_action: e.target.value } } }))}>
                <option value="">Select</option>
                <option>CANCEL_ORDER</option>
                <option>FLAG_REVIEW</option>
              </select>
            )}
            {field(
              "Missing Line Action",
              <select style={input} value={(form.layout_hint_json as any)?.message_control?.missing_line_action || ""} onChange={(e) => setForm((current) => ({ ...current, layout_hint_json: { ...(current.layout_hint_json || {}), message_control: { ...((current.layout_hint_json || {}) as any)?.message_control, missing_line_action: e.target.value } } }))}>
                <option value="">Select</option>
                <option>CANCEL_ORDER</option>
                <option>FLAG_REVIEW</option>
              </select>
            )}
          </div>
          <div style={heroGrid}>
            {field(
              "Outside Horizon Action",
              <select style={input} value={(form.layout_hint_json as any)?.message_control?.outside_horizon_action || ""} onChange={(e) => setForm((current) => ({ ...current, layout_hint_json: { ...(current.layout_hint_json || {}), message_control: { ...((current.layout_hint_json || {}) as any)?.message_control, outside_horizon_action: e.target.value } } }))}>
                <option value="">Select</option>
                <option>NEW_ORDER</option>
                <option>FLAG_REVIEW</option>
              </select>
            )}
            {field(
              "Forecast Action",
              <select style={input} value={(form.layout_hint_json as any)?.message_control?.forecast_action || ""} onChange={(e) => setForm((current) => ({ ...current, layout_hint_json: { ...(current.layout_hint_json || {}), message_control: { ...((current.layout_hint_json || {}) as any)?.message_control, forecast_action: e.target.value } } }))}>
                <option value="">Select</option>
                <option>EMAIL_ONLY</option>
                <option>EMAIL_AND_FLAG</option>
                <option>FLAG_REVIEW</option>
              </select>
            )}
            {field(
              "Forecast Email Subject",
              <input style={input} value={(form.layout_hint_json as any)?.message_control?.forecast_email_subject || ""} onChange={(e) => setForm((current) => ({ ...current, layout_hint_json: { ...(current.layout_hint_json || {}), message_control: { ...((current.layout_hint_json || {}) as any)?.message_control, forecast_email_subject: e.target.value } } }))} placeholder="Forecast received for {{document_number}}" />
            )}
          </div>
          {field(
            "Forecast Email Body HTML",
            <textarea style={{ ...textarea, minHeight: 120 }} value={(form.layout_hint_json as any)?.message_control?.forecast_email_body_html || ""} onChange={(e) => setForm((current) => ({ ...current, layout_hint_json: { ...(current.layout_hint_json || {}), message_control: { ...((current.layout_hint_json || {}) as any)?.message_control, forecast_email_body_html: e.target.value } } }))} placeholder="Optional HTML email body for forecast-only notifications" />
          )}
        </div>
        <div style={heroGrid}>
          {field(
            "Target Message Version",
            <input
              style={input}
              value={form.target_message_version}
              onChange={(e) => setForm({ ...form, target_message_version: e.target.value })}
              placeholder="e.g. ORDERS05 / v1"
            />
          )}

          {field(
            "Transaction ID Source",
            <input
              style={input}
              value={form.transaction_id_source}
              onChange={(e) => setForm({ ...form, transaction_id_source: e.target.value })}
              placeholder="e.g. document_number / delivery_number / billing_document_number"
            />
          )}

          <div>
            <div style={labelStyle}>Customization Required</div>
            <label style={checkboxLabel}>
              <input
                type="checkbox"
                checked={form.customization_required}
                onChange={(e) => setForm({ ...form, customization_required: e.target.checked })}
              />
              <span>Trading partner requires output customization</span>
            </label>
          </div>

          {field(
            "Customization Notes",
            <input
              style={input}
              value={form.customization_notes}
              onChange={(e) => setForm({ ...form, customization_notes: e.target.value })}
              placeholder="e.g. custom text IDs, segment behavior, API payload extension"
            />
          )}
        </div>

        <div style={jsonSectionGrid}>
          <div style={builderCard}>
            <div style={detailTitle}>Target Header Mapping</div>
            <div style={helperText}>
              Map ERP target header fields to canonical source fields. This drives SAP / Oracle / D365 / JD Edwards output generation.
            </div>
            <MappingBuilder
              rows={Object.entries(form.field_mapping_json || {})}
              targetOptions={HEADER_TARGET_OPTIONS}
              sourceOptions={HEADER_SOURCE_OPTIONS}
              onChange={(oldKey, nextKey, nextValue) => setObjectEntry("field_mapping_json", oldKey, nextKey, nextValue)}
              onRemove={(targetKey) => removeObjectEntry("field_mapping_json", targetKey)}
            />
            <button
              type="button"
              style={ghostButton}
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  field_mapping_json: {
                    ...(current.field_mapping_json || {}),
                    [`new_header_field_${Object.keys(current.field_mapping_json || {}).length + 1}`]: "",
                  },
                }))
              }
            >
              Add Header Mapping Row
            </button>
          </div>

          <div style={builderCard}>
            <div style={detailTitle}>Target Defaults / Text IDs</div>
            <div style={helperText}>
              Use these for ERP-specific defaults like SAP Header Text ID, Line Text ID, or JD Edwards custom references.
            </div>
            <div style={textIdGrid}>
              {field(
                "Header Text ID",
                <input
                  style={input}
                  value={String(form.header_defaults_json?.header_text_id || "")}
                  onChange={(e) => setHeaderDefault("header_text_id", e.target.value)}
                  placeholder="e.g. Z001"
                />
              )}
              {field(
                "Line Text ID",
                <input
                  style={input}
                  value={String(form.header_defaults_json?.line_text_id || "")}
                  onChange={(e) => setHeaderDefault("line_text_id", e.target.value)}
                  placeholder="e.g. ZL01"
                />
              )}
            </div>
            {jsonField(
              "Advanced Defaults JSON",
              "Optional advanced defaults beyond the dedicated text ID fields.",
              form.header_defaults_json,
              (v) => setForm({ ...form, header_defaults_json: parseJSON(v) })
            )}
          </div>

          <div style={builderCard}>
            <div style={detailTitle}>Target Line Mapping</div>
            <div style={helperText}>
              Map ERP target line-item fields to canonical item fields, including JD Edwards line payloads.
            </div>
            <MappingBuilder
              rows={Object.entries(form.line_mapping_json || {})}
              targetOptions={LINE_TARGET_OPTIONS}
              sourceOptions={LINE_SOURCE_OPTIONS}
              onChange={(oldKey, nextKey, nextValue) => setObjectEntry("line_mapping_json", oldKey, nextKey, nextValue)}
              onRemove={(targetKey) => removeObjectEntry("line_mapping_json", targetKey)}
            />
            <button
              type="button"
              style={ghostButton}
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  line_mapping_json: {
                    ...(current.line_mapping_json || {}),
                    [`new_line_field_${Object.keys(current.line_mapping_json || {}).length + 1}`]: "",
                  },
                }))
              }
            >
              Add Line Mapping Row
            </button>
          </div>

          {jsonField(
            "Validation Rules",
            "Define profile-specific field validation. Example keys: mandatory_fields, optional_fields, conditional_fields, or field_requirements.",
            form.validation_json,
            (v) => setForm({ ...form, validation_json: parseJSON(v) })
          )}
        </div>

        <div style={buttonRow}>
          <button type="button" style={primaryButton} onClick={saveProfile} disabled={saving}>
            {saving ? "Saving..." : "Save Mapping Profile"}
          </button>
        </div>
      </div>

      <div style={tableCard}>
        <div style={sectionLabel}>Configured Profiles</div>
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Profile</th>
                <th style={thStyle}>Document Type</th>
                <th style={thStyle}>Input Format</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} style={tdEmptyStyle}>Loading mapping profiles...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={3} style={tdEmptyStyle}>No profiles configured.</td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={row.mapping_profile_id || row.profile_id || `${row.profile_name}-${idx}`}>
                    <td style={tdStyle}>{row.profile_name || "-"}</td>
                    <td style={tdStyle}>{row.document_type || "-"}</td>
                    <td style={tdStyle}>{row.input_format || "-"}</td>
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

function MappingBuilder({
  rows,
  targetOptions,
  sourceOptions,
  onChange,
  onRemove,
}: {
  rows: Array<[string, any]>;
  targetOptions: string[];
  sourceOptions: string[];
  onChange: (oldKey: string, nextKey: string, nextValue: string) => void;
  onRemove: (targetKey: string) => void;
}) {
  if (rows.length === 0) {
    return <div style={emptyHint}>No mappings added yet.</div>;
  }

  return (
    <div style={mappingGrid}>
      {rows.map(([targetKey, sourceValue], idx) => (
        <div key={`${targetKey}-${idx}`} style={mappingRow}>
          <div style={mappingCell}>
            <div style={miniLabel}>Target Field</div>
            <input
              list={`target-options-${idx}`}
              style={input}
              value={targetKey}
              onChange={(e) => onChange(targetKey, e.target.value, String(sourceValue || ""))}
              placeholder="Target field"
            />
            <datalist id={`target-options-${idx}`}>
              {targetOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>

          <div style={mappingCell}>
            <div style={miniLabel}>Canonical Source</div>
            <input
              list={`source-options-${idx}`}
              style={input}
              value={String(sourceValue || "")}
              onChange={(e) => onChange(targetKey, targetKey, e.target.value)}
              placeholder="Canonical path"
            />
            <datalist id={`source-options-${idx}`}>
              {sourceOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>

          <button type="button" style={dangerGhostButton} onClick={() => onRemove(targetKey)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function field(label: string, el: React.ReactNode) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      {el}
    </div>
  );
}

function jsonField(
  label: string,
  helper: string,
  value: any,
  onChange: (v: string) => void
) {
  return (
    <div style={jsonCard}>
      <div style={detailTitle}>{label}</div>
      <div style={helperText}>{helper}</div>
      <textarea
        style={textarea}
        value={JSON.stringify(value, null, 2)}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}

const wrap: React.CSSProperties = { minWidth: 0 };
const headerRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16, flexWrap: "wrap" };
const title: React.CSSProperties = { fontSize: 18, fontWeight: 800, color: "#0f172a" };
const subtitle: React.CSSProperties = { fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 1.6 };
const modePill: React.CSSProperties = { border: "1px solid #dbe4ee", background: "#fff", color: "#334155", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 700 };
const card: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)", padding: 16 };
const tableCard: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", padding: 16, marginTop: 16 };
const sectionLabel: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: "#334155", marginBottom: 14 };
const heroGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1.5fr 0.75fr 0.75fr", gap: 14, alignItems: "start" };
const jsonSectionGrid: React.CSSProperties = { display: "grid", gap: 14, marginTop: 16 };
const jsonCard: React.CSSProperties = { border: "1px solid #eef2f7", borderRadius: 12, background: "#fff", padding: 12 };
const builderCard: React.CSSProperties = { border: "1px solid #eef2f7", borderRadius: 12, background: "#fff", padding: 12 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 };
const miniLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4 };
const detailTitle: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 6 };
const helperText: React.CSSProperties = { fontSize: 12, color: "#64748b", marginBottom: 10, lineHeight: 1.6 };
const input: React.CSSProperties = { width: "100%", minHeight: 40, padding: "8px 10px", borderRadius: 10, border: "1px solid #dbe4ee", background: "#fff", fontSize: 13, color: "#0f172a", outline: "none", boxSizing: "border-box" };
const checkboxLabel: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, minHeight: 40, fontSize: 13, color: "#0f172a" };
const textarea: React.CSSProperties = { width: "100%", minHeight: 140, borderRadius: 10, border: "1px solid #dbe4ee", background: "#f8fafc", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12, color: "#0f172a", outline: "none", boxSizing: "border-box", padding: 12, whiteSpace: "pre" };
const buttonRow: React.CSSProperties = { display: "flex", gap: 10, marginTop: 16 };
const primaryButton: React.CSSProperties = { border: "1px solid #0b5fff", background: "#0b5fff", color: "#fff", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const ghostButton: React.CSSProperties = { border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", marginTop: 12 };
const dangerGhostButton: React.CSSProperties = { border: "1px solid #fecaca", background: "#fff5f5", color: "#b91c1c", borderRadius: 10, padding: "10px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", alignSelf: "end" };
const mappingGrid: React.CSSProperties = { display: "grid", gap: 10 };
const mappingRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "end" };
const mappingCell: React.CSSProperties = { minWidth: 0 };
const emptyHint: React.CSSProperties = { fontSize: 12, color: "#94a3b8", padding: "8px 0" };
const textIdGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 12, fontWeight: 800, color: "#334155", borderBottom: "1px solid #e5e7eb", background: "#f8fafc", verticalAlign: "top" };
const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "#0f172a", borderBottom: "1px solid #eef2f7", verticalAlign: "top" };
const tdEmptyStyle: React.CSSProperties = { padding: "16px 12px", fontSize: 13, color: "#64748b", borderBottom: "1px solid #eef2f7" };

