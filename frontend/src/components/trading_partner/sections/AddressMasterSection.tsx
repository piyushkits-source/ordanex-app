import React, { useEffect, useState } from "react";
import { TradingPartner } from "types/tradingPartner";

const API_BASE = "/address-master";

export default function AddressMasterSection({
  partner,
  onBanner,
}: {
  partner: TradingPartner;
  onBanner: (text: string) => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [file, setFile] = useState<File | null>(null);

  const [previewText, setPreviewText] = useState("");
  const [previewResult, setPreviewResult] = useState<any>(null);

  const [form, setForm] = useState({
    address_line1: "",
    city: "",
    country: "",
    ship_to_code: "",
    sold_to_code: "",
  });

  useEffect(() => {
    loadRows();
  }, [partner.partner_id]);

  async function loadRows() {
    try {
      setLoading(true);
      const res = await fetch(
        `${API_BASE}?partner_id=${partner.partner_id}`
      );
      const data = await res.json();
      setRows(data || []);
    } catch {
      onBanner("Failed to load address master");
    } finally {
      setLoading(false);
    }
  }

  async function saveRow() {
    try {
      if (!form.address_line1) {
        onBanner("Address is required");
        return;
      }

      const res = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          client_id: partner.client_id,
          partner_id: partner.partner_id,
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      onBanner("Address saved");
      setForm({
        address_line1: "",
        city: "",
        country: "",
        ship_to_code: "",
        sold_to_code: "",
      });

      loadRows();
    } catch (e: any) {
      onBanner(e.message);
    }
  }

  async function deleteRow(id: string) {
    await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
    loadRows();
  }

  async function downloadTemplate() {
    const res = await fetch(
      `${API_BASE}/template/${partner.partner_id}`
    );

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "address_template.xlsx";
    a.click();
  }

  async function uploadFile() {
    if (!file) {
      onBanner("Select file");
      return;
    }

    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch(
      `${API_BASE}/upload/${partner.partner_id}`,
      {
        method: "POST",
        body: fd,
      }
    );

    const contentType = res.headers.get("content-type") || "";
    const uploadStatus = res.headers.get("X-Upload-Status") || "";

    if (
      uploadStatus === "validation_failed" ||
      contentType.includes("excel")
    ) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "validation_errors.xlsx";
      a.click();

      onBanner("Validation failed. File downloaded.");
      return;
    }

    const data = await res.json();
    onBanner(`Uploaded ${data.rows_processed}`);
    loadRows();
  }

  async function runMatch() {
    const res = await fetch(`${API_BASE}/match-preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        partner_id: partner.partner_id,
        source_address_text: previewText,
      }),
    });

    const data = await res.json();
    setPreviewResult(data);
  }

  return (
    <div style={page}>
      <div style={title}>Address Master</div>

      {/* -------- SINGLE ENTRY -------- */}
      <div style={card}>
        <div style={sectionTitle}>Single Entry</div>

        <div style={grid}>
          <input
            style={input}
            placeholder="Address Line1"
            value={form.address_line1}
            onChange={(e) =>
              setForm({ ...form, address_line1: e.target.value })
            }
          />
          <input
            style={input}
            placeholder="City"
            value={form.city}
            onChange={(e) =>
              setForm({ ...form, city: e.target.value })
            }
          />
          <input
            style={input}
            placeholder="Country"
            value={form.country}
            onChange={(e) =>
              setForm({ ...form, country: e.target.value })
            }
          />
          <input
            style={input}
            placeholder="Ship To"
            value={form.ship_to_code}
            onChange={(e) =>
              setForm({ ...form, ship_to_code: e.target.value })
            }
          />
          <input
            style={input}
            placeholder="Sold To"
            value={form.sold_to_code}
            onChange={(e) =>
              setForm({ ...form, sold_to_code: e.target.value })
            }
          />
        </div>

        <button style={primaryBtn} onClick={saveRow}>
          Save Address
        </button>
      </div>

      {/* -------- BULK -------- */}
      <div style={card}>
        <div style={sectionTitle}>Bulk Onboarding</div>

        <div style={toolbar}>
          <button style={secondaryBtn} onClick={downloadTemplate}>
            Download Template
          </button>

          <input
            type="file"
            onChange={(e) =>
              setFile(e.target.files?.[0] || null)
            }
          />

          <button style={primaryBtn} onClick={uploadFile}>
            Upload
          </button>
        </div>
      </div>

      {/* -------- MATCH -------- */}
      <div style={card}>
        <div style={sectionTitle}>AI Address Matching</div>

        <textarea
          style={textarea}
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
          placeholder="Paste PO address here..."
        />

        <button style={primaryBtn} onClick={runMatch}>
          Run Match
        </button>

        {previewResult?.best_match && (
          <div style={resultBox}>
            <div>
              <b>Confidence:</b> {previewResult.best_match.score}
            </div>
            <div>
              <b>Ship-To:</b>{" "}
              {previewResult.best_match.payload.ship_to_code}
            </div>
            <div>
              <b>Sold-To:</b>{" "}
              {previewResult.best_match.payload.sold_to_code}
            </div>
          </div>
        )}
      </div>

      {/* -------- TABLE -------- */}
      <div style={card}>
        <div style={sectionTitle}>Configured</div>

        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Address</th>
              <th style={th}>City</th>
              <th style={th}>Country</th>
              <th style={th}>Codes</th>
              <th style={th}></th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>Loading...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5}>No records</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.address_id}>
                  <td style={td}>{r.address_line1}</td>
                  <td style={td}>{r.city}</td>
                  <td style={td}>{r.country}</td>
                  <td style={td}>
                    {r.ship_to_code || "-"} /{" "}
                    {r.sold_to_code || "-"}
                  </td>
                  <td style={td}>
                    <button
                      style={secondaryBtn}
                      onClick={() => deleteRow(r.address_id)}
                    >
                      Delete
                    </button>
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

/* ---------- STYLES ---------- */

const page = { display: "flex", flexDirection: "column", gap: 16 };

const title = {
  fontSize: 18,
  fontWeight: 800,
  color: "#0f172a",
};

const card = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
  background: "#fff",
};

const sectionTitle = {
  fontWeight: 800,
  marginBottom: 10,
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(3,1fr)",
  gap: 12,
  marginBottom: 12,
};

const input = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid #dbe4ee",
};

const toolbar = {
  display: "flex",
  gap: 10,
  alignItems: "center",
};

const textarea = {
  width: "100%",
  height: 100,
  padding: 10,
  border: "1px solid #dbe4ee",
  borderRadius: 8,
  marginBottom: 10,
};

const resultBox = {
  marginTop: 10,
  padding: 10,
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#f8fafc",
};

const primaryBtn = {
  background: "#0b5fff",
  color: "#fff",
  border: "none",
  padding: "10px 14px",
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryBtn = {
  background: "#fff",
  border: "1px solid #dbe4ee",
  padding: "8px 12px",
  borderRadius: 8,
  cursor: "pointer",
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
};

const th = {
  textAlign: "left",
  padding: 10,
  background: "#f8fafc",
};

const td = {
  padding: 10,
  borderTop: "1px solid #eee",
};