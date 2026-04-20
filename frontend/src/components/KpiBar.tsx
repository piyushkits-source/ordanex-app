import type { PurchaseOrder } from "../types";

export default function KpiBar({ rows }: { rows: PurchaseOrder[] }) {
  const total = rows.length;
  const success = rows.filter(r => ["SUCCESS","DELIVERED"].includes((r.status ?? "").toUpperCase())).length;
  const pending = rows.filter(r => ["NEW","PROCESSING"].includes((r.status ?? "").toUpperCase())).length;
  const failed = rows.filter(r => ["ERROR","FAILED","DELIVERY_FAILED","BLOCKED"].includes((r.status ?? "").toUpperCase())).length;

  return (
    <div className="kpi-grid">
      <div className="kpi-card"><div className="kpi-icon">📄</div><div><div className="kpi-value">{total}</div><div className="kpi-label">Total Messages</div></div></div>
      <div className="kpi-card"><div className="kpi-icon">🟢</div><div><div className="kpi-value">{success}</div><div className="kpi-label">Success</div></div></div>
      <div className="kpi-card"><div className="kpi-icon">🟡</div><div><div className="kpi-value">{pending}</div><div className="kpi-label">Pending</div></div></div>
      <div className="kpi-card"><div className="kpi-icon">🔴</div><div><div className="kpi-value">{failed}</div><div className="kpi-label">Failed</div></div></div>
    </div>
  );
}
