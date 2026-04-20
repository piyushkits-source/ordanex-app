import React, { useEffect, useState } from "react";
import { apiFetch, parseApiError } from "utils/api";
import { TradingPartner } from "types/tradingPartner";

const API_BASE = "/trading-partners";

export default function MappingProfilesSection({
  partner,
  onBanner,
}: {
  partner: TradingPartner;
  onBanner: (text: string) => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({
    profile_name: "",
    document_type: "PO",
    input_format: "PDF",
    header_mapping: {},
    line_mapping: {},
    validation: {},
  });

  useEffect(() => {
    loadRows();
  }, [partner.partner_id]);

  async function loadRows() {
    try {
      const res = await apiFetch(
        `${API_BASE}/${partner.partner_id}/mapping-profiles`
      );
      if (!res.ok) throw new Error(await parseApiError(res));
      setRows(await res.json());
    } catch (err: any) {
      onBanner(err.message);
    }
  }

  async function saveProfile() {
    try {
      const payload = {
        ...form,
        client_id: partner.client_id,
        partner_id: partner.partner_id,
      };

      const res = await apiFetch(
        `${API_BASE}/${partner.partner_id}/mapping-profiles`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) throw new Error(await parseApiError(res));

      onBanner("Mapping profile created");
      resetForm();
      await loadRows();
    } catch (err: any) {
      onBanner(err.message);
    }
  }

  function resetForm() {
    setForm({
      profile_name: "",
      document_type: "PO",
      input_format: "PDF",
      header_mapping: {},
      line_mapping: {},
      validation: {},
    });
  }

  function parseJSON(value: string) {
    try {
      return JSON.parse(value || "{}");
    } catch {
      return {};
    }
  }

  return (
    <div style={wrap}>
      <div style={title}>Mapping Profiles</div>

      <div style={card}>
        <div style={grid}>
          {field(
            "Profile Name",
            <input
              style={input}
              value={form.profile_name}
              onChange={(e) =>
                setForm({ ...form, profile_name: e.target.value })
              }
            />
          )}

          {field(
            "Document Type",
            <select
              style={input}
              value={form.document_type}
              onChange={(e) =>
                setForm({ ...form, document_type: e.target.value })
              }
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
              onChange={(e) =>
                setForm({ ...form, input_format: e.target.value })
              }
            >
              <option>PDF</option>
              <option>EXCEL</option>
              <option>EDI</option>
              <option>XML</option>
            </select>
          )}
        </div>

        {jsonField(
          "Header Mapping",
          form.header_mapping,
          (v) => setForm({ ...form, header_mapping: parseJSON(v) })
        )}

        {jsonField(
          "Line Mapping",
          form.line_mapping,
          (v) => setForm({ ...form, line_mapping: parseJSON(v) })
        )}

        {jsonField(
          "Validation",
          form.validation,
          (v) => setForm({ ...form, validation: parseJSON(v) })
        )}

        <button style={button} onClick={saveProfile}>
          Save Mapping Profile
        </button>
      </div>

      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Profile</th>
            <th style={th}>Doc</th>
            <th style={th}>Format</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} style={td}>
                No profiles configured
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.profile_id}>
                <td style={td}>{r.profile_name}</td>
                <td style={td}>{r.document_type}</td>
                <td style={td}>{r.input_format}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
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
  value: any,
  onChange: (v: string) => void
) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={labelStyle}>{label}</div>
      <textarea
        style={textarea}
        value={JSON.stringify(value, null, 2)}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

const wrap = { minWidth: 0 };
const title = { fontSize: 16, fontWeight: 800 };
const card = { border: "1px solid #e5e7eb", padding: 16, borderRadius: 12 };
const grid = { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 };
const input = { width: "100%", padding: 8, borderRadius: 8 };
const textarea = {
  width: "100%",
  minHeight: 120,
  fontFamily: "monospace",
};
const button = { marginTop: 12, padding: "8px 14px", background: "#0b5fff", color: "#fff" };
const table = { width: "100%", marginTop: 16 };
const th = { textAlign: "left", padding: 10 };
const td = { padding: 10 };
const labelStyle = { fontSize: 12, fontWeight: 700 };