import type { PurchaseOrder } from "../types/po";
import StatusBadge from "./StatusBadge";

interface Props {
  rows: PurchaseOrder[];
  selectedPoId?: string | null;
  onSelect: (row: PurchaseOrder) => void;
}

export default function PoTable({ rows, selectedPoId, onSelect }: Props) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead style={{ background: "#f9fafb" }}>
          <tr>
            {["PO Number", "Supplier", "Status", "Sender", "Received"].map((label) => (
              <th key={label} style={{ textAlign: "left", padding: 12, fontSize: 13, color: "#374151" }}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.po_id}
              onClick={() => onSelect(row)}
              style={{
                cursor: "pointer",
                background: row.po_id === selectedPoId ? "#eef2ff" : "#ffffff",
                borderTop: "1px solid #f3f4f6",
              }}
            >
              <td style={{ padding: 12 }}>{row.po_number || row.po_id}</td>
              <td style={{ padding: 12 }}>{row.supplier_name || "-"}</td>
              <td style={{ padding: 12 }}><StatusBadge value={row.status} /></td>
              <td style={{ padding: 12 }}>{row.sender || "-"}</td>
              <td style={{ padding: 12 }}>{row.received_at ? new Date(row.received_at).toLocaleString() : "-"}</td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={5} style={{ padding: 16, textAlign: "center", color: "#6b7280" }}>
                No records found.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}