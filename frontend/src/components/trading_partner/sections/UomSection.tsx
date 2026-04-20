import React, { useEffect, useState } from "react";
import { apiFetch, parseApiError } from "utils/api";
import { TradingPartner, UomRule } from "types/tradingPartner";
import UomRuleModal from "components/trading_partner/modals/UomRuleModal";

const API_BASE = "/trading-partners";

const defaultUomRule = (partnerId: string): UomRule => ({
  partner_id: partnerId,
  customer_code: "",
  supplier_code: "",
  ship_to_code: "",
  material_code: "",
  product_code: "",
  input_uom: "EA",
  output_uom: "EA",
  conversion_factor: "1",
  conversion_divider: "1",
  rounding_digits: 2,
  priority: 100,
  is_active: true,
  notes: "",
});

export default function UomSection({
  partner,
  onBanner,
}: {
  partner: TradingPartner;
  onBanner: (text: string) => void;
}) {
  const [rows, setRows] = useState<UomRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [form, setForm] = useState<UomRule>(defaultUomRule(partner.partner_id));

  useEffect(() => {
    setForm(defaultUomRule(partner.partner_id));
    void loadRows();
  }, [partner.partner_id]);

  async function loadRows() {
    try {
      setLoading(true);
      const res = await apiFetch(
        `${API_BASE}/uom-rules?partner_id=${encodeURIComponent(partner.partner_id)}`,
        { method: "GET" }
      );
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      onBanner(err?.message || "Failed to load UOM rules.");
    } finally {
      setLoading(false);
    }
  }

  async function saveRow() {
    try {
      const endpoint = form.uom_rule_id
        ? `${API_BASE}/uom-rules/${form.uom_rule_id}`
        : `${API_BASE}/uom-rules`;

      const method = form.uom_rule_id ? "PUT" : "POST";

      const payload = {
        ...form,
        partner_id: partner.partner_id,
        customer_code: nullable(form.customer_code),
        supplier_code: nullable(form.supplier_code),
        ship_to_code: nullable(form.ship_to_code),
        material_code: nullable(form.material_code),
        product_code: nullable(form.product_code),
        conversion_factor: nullable(form.conversion_factor),
        conversion_divider: nullable(form.conversion_divider),
        notes: nullable(form.notes),
      };

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      onBanner(form.uom_rule_id ? "UOM rule updated successfully." : "UOM rule saved successfully.");
      setModalOpen(false);
      setForm(defaultUomRule(partner.partner_id));
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to save UOM rule.");
    }
  }

  async function deleteRow(rule: UomRule) {
    try {
      if (!rule.uom_rule_id) return;
      if (!window.confirm("Delete this UOM rule?")) return;

      const res = await apiFetch(`${API_BASE}/uom-rules/${rule.uom_rule_id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      onBanner("UOM rule deleted successfully.");
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to delete UOM rule.");
    }
  }

  async function downloadTemplate() {
    try {
      setBusy(true);

      const res = await apiFetch(`${API_BASE}/${partner.partner_id}/uom/template`, {
        method: "GET",
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "uom_template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
      onBanner("UOM template downloaded successfully.");
    } catch (err: any) {
      onBanner(err?.message || "Unable to download UOM template.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadWorkbook(file: File) {
    try {
      setBusy(true);

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE}/${partner.partner_id}/uom/upload`, {
        method: "POST",
        body: formData,
      });

      const contentType = res.headers.get("content-type") || "";
      const uploadStatus = res.headers.get("X-Upload-Status") || "";

      if (!res.ok) {
        throw new Error(await res.text());
      }

      if (
        uploadStatus === "validation_failed" ||
        contentType.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      ) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "uom_validation_errors.xlsx";
        document.body.appendChild(a);
        a.click();
        a.remove();

        window.URL.revokeObjectURL(url);
        onBanner("Validation failed. Error workbook downloaded.");
        return;
      }

      const data = await res.json();
      onBanner(`Upload successful. Rows processed: ${data.rows_processed ?? 0}`);
      setSelectedFile(null);
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to upload UOM workbook.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={card}>
      <div style={title}>UOM Rules</div>

      <div style={toolbar}>
        <button
          type="button"
          style={secondaryButton}
          onClick={downloadTemplate}
          disabled={busy}
        >
          Download Template
        </button>

        <label style={fileLabel}>
          <input
            type="file"
            accept=".xlsx"
            style={{ display: "none" }}
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
          />
          Choose File
        </label>

        <button
          type="button"
          style={secondaryButton}
          disabled={busy}
          onClick={() => {
            if (!selectedFile) {
              onBanner("Please select a file first.");
              return;
            }
            void uploadWorkbook(selectedFile);
          }}
        >
          Upload UOM
        </button>

        <button
          type="button"
          style={primaryButton}
          onClick={() => {
            setForm(defaultUomRule(partner.partner_id));
            setModalOpen(true);
          }}
        >
          Add UOM Rule
        </button>
      </div>

      <div style={fileInfo}>
        {selectedFile ? `Selected: ${selectedFile.name}` : "No file selected"}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Customer</th>
              <th style={thStyle}>Supplier</th>
              <th style={thStyle}>Ship-To</th>
              <th style={thStyle}>Material</th>
              <th style={thStyle}>Product</th>
              <th style={thStyle}>Input</th>
              <th style={thStyle}>Output</th>
              <th style={thStyle}>Factor</th>
              <th style={thStyle}>Divider</th>
              <th style={thStyle}>Priority</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={12} style={tdEmptyStyle}>
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={12} style={tdEmptyStyle}>
                  No UOM rules configured.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.uom_rule_id}>
                  <td style={tdStyle}>{row.customer_code || "-"}</td>
                  <td style={tdStyle}>{row.supplier_code || "-"}</td>
                  <td style={tdStyle}>{row.ship_to_code || "-"}</td>
                  <td style={tdStyle}>{row.material_code || "-"}</td>
                  <td style={tdStyle}>{row.product_code || "-"}</td>
                  <td style={tdStyle}>{row.input_uom}</td>
                  <td style={tdStyle}>{row.output_uom}</td>
                  <td style={tdStyle}>{row.conversion_factor || "-"}</td>
                  <td style={tdStyle}>{row.conversion_divider || "-"}</td>
                  <td style={tdStyle}>{row.priority}</td>
                  <td style={tdStyle}>{row.is_active ? "ACTIVE" : "INACTIVE"}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        style={miniButton}
                        onClick={() => {
                          setForm({ ...row, partner_id: partner.partner_id });
                          setModalOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        style={dangerMiniButton}
                        onClick={() => void deleteRow(row)}
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

      <UomRuleModal
        open={modalOpen}
        value={form}
        onChange={setForm}
        onSave={saveRow}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}

function nullable(value: any) {
  const v = String(value || "").trim();
  return v === "" ? null : v;
}

const card: React.CSSProperties = {
  border: "1px solid #eef2f7",
  borderRadius: 12,
  background: "#fff",
  padding: 16,
  minWidth: 0,
};

const title: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "#0f172a",
  marginBottom: 14,
};

const toolbar: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 12,
  alignItems: "center",
};

const fileInfo: React.CSSProperties = {
  fontSize: 13,
  color: "#475569",
  marginBottom: 14,
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

const fileLabel: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  background: "#f8fafc",
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