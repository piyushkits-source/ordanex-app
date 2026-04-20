import { FaChevronDown, FaChevronUp } from "react-icons/fa6";
import { glassCard } from "../common/PremiumStyles";
import type { MonitorRow } from "../../types/messageMonitor";

interface Props {
  rows: MonitorRow[];
  expandedRowId: string | null;
  onToggle: (row: MonitorRow) => void;
}

export default function PremiumGrid({ rows, expandedRowId, onToggle }: Props) {
  return (
    <div style={{ ...glassCard, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "140px 170px 150px 1fr 1fr 180px 50px", padding: "14px 16px", background: "#f8fafc", fontSize: 12, fontWeight: 800, color: "#64748b" }}>
        <div>Message Status</div>
        <div>Document ID</div>
        <div>Message Type</div>
        <div>Sender</div>
        <div>Receiver</div>
        <div>Transaction Number</div>
        <div />
      </div>

      {rows.map((row) => {
        const expanded = expandedRowId == row.id;
        return (
          <div key={row.id} style={{ borderTop: "1px solid #eef2f7" }}>
            <div
              onClick={() => onToggle(row)}
              style={{ display: "grid", gridTemplateColumns: "140px 170px 150px 1fr 1fr 180px 50px", padding: "16px", alignItems: "center", cursor: "pointer", background: expanded ? "#fcfdff" : "#fff" }}
            >
              <div>{statusPill(row.status)}</div>
              <div style={valueStyle}>{row.documentId}</div>
              <div style={valueStyle}>{row.messageType}</div>
              <div style={valueStyle}>{row.sender}</div>
              <div style={valueStyle}>{row.receiver}</div>
              <div style={{ ...valueStyle, fontWeight: 800 }}>{row.transactionNumber}</div>
              <div style={{ color: "#64748b" }}>{expanded ? <FaChevronUp /> : <FaChevronDown />}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function statusPill(status: string) {
  const colorMap: Record<string, string> = {
    SUCCESSFUL: "#059669",
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

const valueStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 14,
  fontWeight: 600,
};