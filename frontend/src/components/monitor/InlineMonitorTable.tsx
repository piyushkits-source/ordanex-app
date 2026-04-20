import { FaChevronDown, FaChevronUp } from "react-icons/fa";
import type { MonitorRow } from "../../types/messageMonitor";
import InlineExpandedContent from "./InlineExpandedContent";

export default function InlineMonitorTable({ rows, expandedId, onToggle, selectedField, onSelectField }: {
  rows: MonitorRow[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  selectedField: string | null;
  onSelectField: (field: string) => void;
}) {
  return (
    <div style={{ background: "#ffffff" }}>
      <div style={{ display: "grid", gridTemplateColumns: "140px 170px 160px 1fr 1fr 180px 54px", background: "#0f7cc0", color: "#fff", fontWeight: 800, fontSize: 13, padding: "12px 14px" }}>
        <div>MESSAGE STATUS</div>
        <div>DOCUMENT ID</div>
        <div>MESSAGE TYPE</div>
        <div>SENDER</div>
        <div>RECEIVER</div>
        <div>TRANSACTION NUMBER</div>
        <div />
      </div>

      {rows.map((row) => {
        const expanded = expandedId === row.id;
        return (
          <div key={row.id} style={{ borderTop: "1px solid #dbe4ee" }}>
            <div style={{ display: "grid", gridTemplateColumns: "140px 170px 160px 1fr 1fr 180px 54px", alignItems: "center", background: "#ffffff" }}>
              <div style={cell}>{pill(row.status)}</div>
              <div style={cell}>{row.documentId}</div>
              <div style={cell}>{row.messageType}</div>
              <div style={cell}>{row.sender}</div>
              <div style={cell}>{row.receiver}</div>
              <div style={{ ...cell, fontWeight: 800 }}>{row.transactionNumber}</div>
              <button type="button" onClick={() => onToggle(row.id)} style={toggleBtn}>
                {expanded ? <FaChevronUp /> : <FaChevronDown />}
              </button>
            </div>

            {expanded ? (
              <InlineExpandedContent row={row} selectedField={selectedField} onSelectField={onSelectField} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function pill(status: string) {
  const colorMap: Record<string, string> = {
    SUCCESSFUL: "#16a34a",
    ERROR: "#dc2626",
    IN_PROGRESS: "#2563eb",
    PENDING: "#d97706",
    ARCHIVED: "#475569",
  };
  return (
    <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: colorMap[status] ?? "#64748b", color: "#fff", fontSize: 12, fontWeight: 800 }}>
      {status}
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
};

const toggleBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#64748b",
  cursor: "pointer",
  minHeight: 56,
};