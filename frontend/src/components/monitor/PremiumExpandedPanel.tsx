import { FaArrowRotateRight, FaDownload, FaFloppyDisk, FaListCheck, FaTimeline, FaBoxArchive } from "react-icons/fa6";
import { glassCard, iconButton, primaryButton, secondaryButton, sectionTitle } from "../common/PremiumStyles";
import DocumentViewer from "../document/DocumentViewer";
import type { MonitorFieldValue, MonitorRow } from "../../types/messageMonitor";

interface Props {
  row: MonitorRow | null;
  selectedField: string | null;
  onSelectField: (fieldKey: string) => void;
}

export default function PremiumExpandedPanel({ row, selectedField, onSelectField }: Props) {
  if (!row) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 16 }}>
      <div style={{ ...glassCard, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={sectionTitle}>Document Viewer</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={iconButton} title="Download Original"><FaDownload /></button>
            <button style={iconButton} title="Download Transformed XML"><FaDownload /></button>
            <button style={iconButton} title="Activity Logs"><FaListCheck /></button>
            <button style={iconButton} title="Processing Flow"><FaTimeline /></button>
          </div>
        </div>

        <div style={{ borderRadius: 18, overflow: "hidden" }}>
          <DocumentViewer
            fileUrl={row.fileUrl || (row as any).file_url}
            fileName={row.fileName || (row as any).file_name}
            mimeType={row.mimeType || (row as any).mime_type}
            rawText={row.rawText || (row as any).raw_text}
          />
        </div>
      </div>

      <div style={{ ...glassCard, padding: 16, display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={sectionTitle}>Extracted Fields</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={{ ...secondaryButton, display: "inline-flex", alignItems: "center", gap: 8 }}>
              <FaBoxArchive /> Archive & Ignore
            </button>
            <button style={{ ...secondaryButton, display: "inline-flex", alignItems: "center", gap: 8 }}>
              <FaFloppyDisk /> Save
            </button>
            <button style={{ ...primaryButton, display: "inline-flex", alignItems: "center", gap: 8 }}>
              <FaArrowRotateRight /> Save & Re-Process
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, maxHeight: 680, overflow: "auto", paddingRight: 4 }}>
          {row.fields.map((field) => (
            <FieldCard
              key={field.key}
              field={field}
              active={selectedField === field.key}
              onClick={() => onSelectField(field.key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FieldCard({ field, active, onClick }: { field: MonitorFieldValue; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        border: `1px solid ${active ? "#111827" : "#e2e8f0"}`,
        background: active ? "#111827" : "#ffffff",
        color: active ? "#ffffff" : "#0f172a",
        borderRadius: 16,
        padding: 14,
        cursor: "pointer",
        boxShadow: active ? "0 10px 20px rgba(15,23,42,0.12)" : "none",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: active ? "#cbd5e1" : "#64748b" }}>{field.label}</div>
      <div style={{ marginTop: 6, fontSize: 15, fontWeight: 800 }}>{field.value || "-"}</div>
      <div style={{ marginTop: 8, fontSize: 12, color: active ? "#cbd5e1" : "#64748b" }}>
        Bounding Box: {field.bbox ? `x:${field.bbox.x}, y:${field.bbox.y}, w:${field.bbox.width}, h:${field.bbox.height}` : "Not mapped"}
      </div>
    </button>
  );
}