import React, { useState } from "react";
import { TradingPartner } from "types/tradingPartner";

const API_BASE = "/trading-partners";

export default function BulkUploadSection({
  partner,
  onBanner,
}: {
  partner: TradingPartner;
  onBanner: (text: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function downloadTemplate() {
    try {
      setBusy(true);

      const res = await fetch(
        `${API_BASE}/${partner.partner_id}/bulk-onboarding/template`,
        { method: "GET" }
      );

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "bulk_onboarding_template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
      onBanner("Template downloaded successfully.");
    } catch (err: any) {
      onBanner(err?.message || "Download failed.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(selectedFile: File) {
    try {
      setBusy(true);

      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch(
        `${API_BASE}/${partner.partner_id}/bulk-onboarding/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const contentType = res.headers.get("content-type") || "";
      const uploadStatus = res.headers.get("X-Upload-Status") || "";

      if (!res.ok) {
        throw new Error(await res.text());
      }

      if (
        uploadStatus === "validation_failed" ||
        contentType.includes(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
      ) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "bulk_onboarding_validation_errors.xlsx";
        document.body.appendChild(a);
        a.click();
        a.remove();

        window.URL.revokeObjectURL(url);
        onBanner("Validation failed. Error workbook downloaded.");
        return;
      }

      const data = await res.json();
      onBanner(`Upload successful. Rows processed: ${data.rows_processed ?? 0}`);
      setFile(null);
    } catch (err: any) {
      onBanner(err?.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={wrap}>
      <div style={title}>Bulk Onboarding</div>
      <div style={subtitle}>
        Download the onboarding template, fill partner onboarding rows, and upload
        it back for validation and processing.
      </div>

      <div style={card}>
        <div style={buttonRow}>
          <button
            type="button"
            style={btn}
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
              onChange={(e) => {
                const selected = e.target.files?.[0] || null;
                setFile(selected);
              }}
            />
            Choose File
          </label>

          <button
            type="button"
            style={btnPrimary}
            onClick={() => {
              if (!file) {
                onBanner("Please select a file first.");
                return;
              }
              void uploadFile(file);
            }}
            disabled={busy}
          >
            Upload File
          </button>
        </div>

        <div style={fileInfo}>
          {file ? `Selected: ${file.name}` : "No file selected"}
        </div>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  minWidth: 0,
};

const title: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: "#0f172a",
  marginBottom: 6,
};

const subtitle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginBottom: 14,
};

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  padding: 16,
  borderRadius: 12,
  background: "#fff",
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const btn: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #0b5fff",
  background: "#0b5fff",
  color: "#fff",
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
};

const fileLabel: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  color: "#0f172a",
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
};

const fileInfo: React.CSSProperties = {
  marginTop: 12,
  fontSize: 13,
  color: "#475569",
};