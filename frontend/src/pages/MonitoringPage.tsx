import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { EnvironmentType } from "../types/common";
import { listPurchaseOrders } from "../api/purchaseOrdersApi";
import PageHeader from "../components/common/PageHeader";

export default function MonitoringPage({ environment }: { environment: EnvironmentType }) {
  const [status, setStatus] = useState("");
  const query = useQuery({
    queryKey: ["monitoring", environment, status],
    queryFn: () => listPurchaseOrders(environment, status || undefined),
  });

  return (
    <div>
      <PageHeader
        title={`${environment} Monitoring`}
        subtitle={environment === "STAGING" ? "Use staging for testing and corrections." : "Production live monitoring."}
        right={
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="ERROR">Error</option>
            <option value="APPROVED">Approved</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        }
      />
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              {["PO Number", "Supplier", "Status", "Source", "Received"].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {(query.data ?? []).map((row) => (
              <tr key={row.po_id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={td}>{row.po_number || row.po_id}</td>
                <td style={td}>{row.supplier_name || "-"}</td>
                <td style={td}>{row.status}</td>
                <td style={td}>{row.source_type}</td>
                <td style={td}>{row.received_at ? new Date(row.received_at).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { border: "1px solid #d1d5db", borderRadius: 10, padding: "10px 12px", background: "#fff" };
const th: React.CSSProperties = { textAlign: "left", padding: 12, fontSize: 13 };
const td: React.CSSProperties = { padding: 12 };