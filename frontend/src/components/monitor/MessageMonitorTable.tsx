import ExpandedMessageRow from "./ExpandedMessageRow";
import type {
  MonitoringRow,
  ActivityLog,
  ProcessingStep,
} from "../../types/monitoring";

export default function MessageMonitorTable({
  rows,
  expandedPoId,
  onToggle,
  selectedField,
  onSelectField,
  logsByPo,
  flowByPo,
  onRefresh,
}: {
  rows: MonitoringRow[];
  expandedPoId: string | null;
  onToggle: (poId: string) => void;
  selectedField: string | null;
  onSelectField: (fieldKey: string) => void;
  logsByPo: Record<string, ActivityLog[]>;
  flowByPo: Record<string, ProcessingStep[]>;
  onRefresh?: () => void | Promise<void>;
}) {
  return (
    <div style={{ background: "#ffffff" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "140px 200px 150px 1.5fr 1.5fr 180px",
          background: "#0f7cc0",
          color: "#fff",
          fontWeight: 800,
          fontSize: 13,
          padding: "12px 14px",
        }}
      >
        <div>MESSAGE STATUS</div>
        <div>DOCUMENT ID</div>
        <div>MESSAGE TYPE</div>
        <div>SENDER</div>
        <div>RECEIVER</div>
        <div>TRANSACTION ID</div>
      </div>

      {rows.map((row) => {
        const expanded = expandedPoId === row.po_id;

        return (
          <div key={row.po_id} style={{ borderTop: "1px solid #dbe4ee" }}>
            <div
              onClick={() => onToggle(row.po_id)}
              style={{
                display: "grid",
                gridTemplateColumns: "140px 200px 150px 1.5fr 1.5fr 180px",
                alignItems: "center",
                background: expanded ? "#eef4ff" : "#ffffff",
                cursor: "pointer",
              }}
            >
              <div style={cell}>{statusPill(row.status)}</div>
              <div style={cell}>{row.po_id}</div>
              <div style={cell}>{displayMessageType(row)}</div>
              <div style={cell}>{row.sender || "-"}</div>
              <div style={cell}>{row.receiver || "-"}</div>
              <div style={{ ...cell, borderBottom: "1px solid #f1f5f9" }}>
                {row.po_number || row.docnum || "-"}
              </div>
            </div>

            {expanded ? (
              <ExpandedMessageRow
                row={row}
                selectedField={selectedField}
                onSelectField={onSelectField}
                activityLogs={logsByPo[row.po_id] || []}
                processingFlow={flowByPo[row.po_id] || []}
                onRefresh={onRefresh}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function displayMessageType(row: any) {
  const raw = (row.source_type || "").toUpperCase();

  if (raw === "UPLOAD" || raw === "PDF" || raw === "FILE") {
    return row.direction === "OUTBOUND" ? "Invoice" : "Orders";
  }
  if (raw.includes("INVOICE")) return "Invoice";
  if (raw.includes("ASN")) return "ASN";
  if (raw.includes("ORDER")) return "Orders";

  return row.direction === "OUTBOUND" ? "Invoice" : "Orders";
}

function statusPill(status?: string | null) {
  const normalized = (status || "NEW").toUpperCase();

  const group =
    ["SUCCESS", "DELIVERED", "PROCESSED", "REPROCESSED"].includes(normalized)
      ? ["Processed", "#16a34a"]
      : ["ARCHIVED"].includes(normalized)
      ? ["Archived", "#475569"]
      : ["ERROR", "FAILED", "DELIVERY_FAILED", "BLOCKED"].includes(normalized)
      ? ["Failed", "#dc2626"]
      : ["Pending", "#d97706"];

  return (
    <span
      style={{
        display: "inline-block",
        padding: "6px 10px",
        borderRadius: 999,
        background: group[1],
        color: "#fff",
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {group[0]}
    </span>
  );
}

const cell: React.CSSProperties = {
  padding: "14px",
  fontSize: 14,
  color: "#0f172a",
  minHeight: 56,
  display: "flex",
  alignItems: "center",
  fontWeight: 500,
};