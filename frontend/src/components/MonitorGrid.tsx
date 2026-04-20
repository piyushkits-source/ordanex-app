import type { PurchaseOrder } from "../types";

type Props = {
  rows: PurchaseOrder[];
  selectedPoId: string | null;
  onSelect: (row: PurchaseOrder) => void;
};

function statusClass(status?: string | null) {
  const s = (status ?? "").toUpperCase();
  if (["SUCCESS","DELIVERED"].includes(s)) return "status-success";
  if (["ERROR","FAILED","DELIVERY_FAILED","BLOCKED"].includes(s)) return "status-failed";
  return "status-pending";
}

function documentNumber(row: PurchaseOrder) {
  return row.docnum || row.po_number || row.po_id;
}

export default function MonitorGrid({ rows, selectedPoId, onSelect }: Props) {
  return (
    <div className="panel">
      <div className="grid-header">
        <div>Status</div><div>Document Number</div><div>Direction</div><div>Sender</div><div>Receiver</div><div>Created</div><div></div>
      </div>
      {rows.map(row => {
        const selected = row.po_id === selectedPoId;
        return (
          <div key={row.po_id} className={selected ? "grid-row grid-row-selected" : "grid-row"}>
            <div><span className={`status-pill ${statusClass(row.status)}`}>{row.status ?? "NEW"}</span></div>
            <div className="doc-cell">{documentNumber(row)}</div>
            <div>{row.direction ?? "INBOUND"}</div>
            <div>{row.sender ?? "Customer"}</div>
            <div>{row.receiver ?? "Supplier"}</div>
            <div>{row.created_at ?? "-"}</div>
            <div><button className="primary-btn" onClick={() => onSelect(row)}>{selected ? "Shrink" : "Expand"}</button></div>
          </div>
        );
      })}
    </div>
  );
}
