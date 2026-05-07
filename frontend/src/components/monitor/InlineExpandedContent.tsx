import { FaDownload, FaHistory, FaMinus, FaPlus, FaProjectDiagram } from "react-icons/fa";
import DocumentViewer from "../document/DocumentViewer";
import { actionBtnPrimary, actionBtnSecondary, smallIconBtn } from "../common/styles";
import type { LineItem, MonitorFieldValue, MonitorRow } from "../../types/messageMonitor";

export default function InlineExpandedContent({ row, selectedField, onSelectField }: { row: MonitorRow; selectedField: string | null; onSelectField: (field: string) => void; }) {
  const editable = row.status === "ERROR" || row.status === "PENDING";

  return (
    <div style={{ padding: 14, background: "#f8fbfe", borderTop: "1px solid #dbe4ee" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.04fr 0.96fr", gap: 14 }}>
        <div style={{ background: "#fff", border: "1px solid #dbe4ee", borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#0f172a" }}>Document Viewer</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={smallIconBtn} title="Download Original"><FaDownload /></button>
              <button style={smallIconBtn} title="Download Transformed XML"><FaDownload /></button>
              <button style={smallIconBtn} title="Activity Logs"><FaHistory /></button>
              <button style={smallIconBtn} title="Processing Flow"><FaProjectDiagram /></button>
            </div>
          </div>
          <DocumentViewer
            fileUrl={row.fileUrl || (row as any).file_url}
            fileName={row.fileName || (row as any).file_name}
            mimeType={row.mimeType || (row as any).mime_type}
            rawText={row.rawText || (row as any).raw_text}
          />
        </div>

        <div style={{ background: "#fff", border: "1px solid #dbe4ee", borderRadius: 12, padding: 14, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#0f172a" }}>Extracted Fields</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={actionBtnSecondary}>Archive & Ignore</button>
              <button style={actionBtnSecondary}>Save</button>
              <button style={actionBtnPrimary}>Save & Re-Process</button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {row.fields.map((field) => (
              <FieldRow key={field.key} field={field} active={selectedField === field.key} onClick={() => onSelectField(field.key)} />
            ))}
          </div>

          <div style={{ borderTop: "1px solid #dbe4ee", paddingTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#0f172a" }}>Line Items</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...smallIconBtn, opacity: editable ? 1 : 0.45, cursor: editable ? "pointer" : "not-allowed" }} disabled={!editable} title="Add line item"><FaPlus /></button>
                <button style={{ ...smallIconBtn, opacity: editable ? 1 : 0.45, cursor: editable ? "pointer" : "not-allowed" }} disabled={!editable} title="Delete line item"><FaMinus /></button>
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {row.lineItems.map((item) => (
                <LineItemCard key={item.id} item={item} editable={editable} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ field, active, onClick }: { field: MonitorFieldValue; active: boolean; onClick: () => void; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        border: `1px solid ${active ? "#1d4ed8" : "#dbe4ee"}`,
        background: active ? "#eff6ff" : "#fff",
        borderRadius: 10,
        padding: 12,
        cursor: "pointer",
      }}
    >
      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{field.label}</div>
      <div style={{ marginTop: 4, fontWeight: 800, color: "#0f172a" }}>{field.value || "-"}</div>
      <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
        {field.bbox ? `BBox: x:${field.bbox.x}, y:${field.bbox.y}, w:${field.bbox.width}, h:${field.bbox.height}` : "Bounding box not mapped"}
      </div>
    </button>
  );
}

function LineItemCard({ item, editable }: { item: LineItem; editable: boolean; }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 0.7fr 0.6fr 0.7fr", gap: 8, border: "1px solid #dbe4ee", background: editable ? "#fff" : "#f8fafc", borderRadius: 10, padding: 10 }}>
      <input defaultValue={item.material} disabled={!editable} style={inputStyle(editable)} />
      <input defaultValue={item.description} disabled={!editable} style={inputStyle(editable)} />
      <input defaultValue={item.quantity} disabled={!editable} style={inputStyle(editable)} />
      <input defaultValue={item.uom} disabled={!editable} style={inputStyle(editable)} />
      <input defaultValue={item.price} disabled={!editable} style={inputStyle(editable)} />
    </div>
  );
}

function inputStyle(editable: boolean): React.CSSProperties {
  return {
    width: "100%",
    border: "1px solid #d5dde7",
    borderRadius: 8,
    padding: "10px 10px",
    background: editable ? "#fff" : "#f1f5f9",
    color: "#0f172a",
    boxSizing: "border-box",
  };
}