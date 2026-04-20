import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { EmailHistoryRow, PoLog, PurchaseOrder } from "../types";

type Props = { selectedPo: PurchaseOrder; };
type DetailTab = "viewer" | "history" | "logs" | "notifications";

function canEdit(status?: string | null) {
  return ["ERROR","NEW","PENDING"].includes((status ?? "").toUpperCase());
}

function documentNumber(row: PurchaseOrder) {
  return row.docnum || row.po_number || row.po_id;
}

export default function DetailWorkspace({ selectedPo }: Props) {
  const [detail, setDetail] = useState<PurchaseOrder | null>(null);
  const [logs, setLogs] = useState<PoLog[]>([]);
  const [emails, setEmails] = useState<EmailHistoryRow[]>([]);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [xmlPayload, setXmlPayload] = useState<string>("");
  const [tab, setTab] = useState<DetailTab>("viewer");
  const [loading, setLoading] = useState(false);
  const [reprocessMessage, setReprocessMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setReprocessMessage("");
      try {
        const [po, xml, poLogs, emailHistory, fileInfo] = await Promise.all([
          api.getPurchaseOrder(selectedPo.po_id),
          api.getPurchaseOrderXml(selectedPo.po_id),
          api.getPurchaseOrderLogs(selectedPo.po_id),
          api.getPurchaseOrderEmailHistory(selectedPo.po_id),
          api.getFileByPo(selectedPo.po_id),
        ]);
        if (!active) return;
        setDetail(po);
        setXmlPayload(xml.xml_payload ?? "");
        setLogs(poLogs);
        setEmails(emailHistory);
        setFileUrl(fileInfo.file?.file_id ? `${api.baseUrl}/files/${fileInfo.file.file_id}/download` : null);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [selectedPo.po_id]);

  const current = detail ?? selectedPo;
  const docNo = useMemo(() => documentNumber(current), [current]);
  const editable = canEdit(current.status);

  async function handleReprocess() {
    try {
      const result = await api.reprocessPurchaseOrder(current.po_id);
      setReprocessMessage(result?.message ?? "Reprocess completed");
    } catch (error) {
      setReprocessMessage(error instanceof Error ? error.message : "Reprocess failed");
    }
  }

  return (
    <div className="workspace panel">
      <div className="workspace-topbar">
        <div>
          <div className="workspace-title">Document Workspace</div>
          <div className="workspace-subtitle">{docNo}</div>
        </div>
        <div className="workspace-actions">
          {fileUrl ? <a className="icon-btn" href={fileUrl} target="_blank" rel="noreferrer">⬇ Original</a> : null}
          {xmlPayload ? <a className="icon-btn" href={`data:application/xml;charset=utf-8,${encodeURIComponent(xmlPayload)}`} download={`${docNo}.xml`}>⬇ XML</a> : null}
          {editable ? <button className="primary-btn" onClick={handleReprocess}>Reprocess</button> : <button className="disabled-btn" disabled>Locked</button>}
        </div>
      </div>

      {reprocessMessage ? <div className="info-banner">{reprocessMessage}</div> : null}

      <div className="workspace-main">
        <div className="workspace-left">
          <div className="section-title">Original Document</div>
          {fileUrl ? (
            <>
              <iframe className="pdf-frame" src={fileUrl} title="Original document" />
              <div className="bounding-box-placeholder">
                Bounding box and visual intelligence overlay will render here once parser returns field coordinates.
              </div>
            </>
          ) : <div className="empty-box">No original file attached.</div>}
        </div>

        <div className="workspace-right">
          <div className="section-title">Extracted Fields</div>
          {loading ? <div className="empty-box">Loading document details...</div> : null}

          <div className="field-grid">
            <Field label="Document Number" value={current.docnum || current.po_number} editable={editable} />
            <Field label="Document Date" value={current.po_date} editable={editable} />
            <Field label="Partner Name" value={current.supplier_name} editable={editable} />
            <Field label="Currency" value={current.currency} editable={editable} />
            <Field label="Sender" value={current.sender || "Customer"} editable={false} />
            <Field label="Receiver" value={current.receiver || "Supplier"} editable={false} />
            <Field label="Direction" value={current.direction || "INBOUND"} editable={false} />
            <Field label="Status" value={current.status} editable={false} />
          </div>

          <div className="section-title">Line Items</div>
          <div className="items-table-wrap">
            <table className="items-table">
              <thead>
                <tr><th>Line</th><th>Material</th><th>Description</th><th>Qty</th><th>UOM</th><th>Unit Price</th><th>Amount</th></tr>
              </thead>
              <tbody>
                {(current.items ?? []).map((item, index) => (
                  <tr key={`${item.po_item_id ?? index}`}>
                    <td>{item.line_no}</td>
                    <td>{item.material_code ?? "-"}</td>
                    <td>{item.description ?? "-"}</td>
                    <td>{item.quantity ?? "-"}</td>
                    <td>{item.uom ?? "-"}</td>
                    <td>{item.unit_price ?? "-"}</td>
                    <td>{item.amount ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="intelligence-card">
            <div className="section-title">Visual Intelligence</div>
            <div className="intelligence-metrics">
              <div className="mini-stat"><span>Confidence</span><strong>{current.po_confidence ?? "N/A"}</strong></div>
              <div className="mini-stat"><span>Validation</span><strong>{current.po_validation_reason ?? "Clean"}</strong></div>
            </div>
            <ul className="insight-list">
              <li>Field-to-document visual mapping placeholder</li>
              <li>Bounding box overlay placeholder</li>
              <li>Correction hints can be rendered here</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="tabs-row">
        <button className={tab === "viewer" ? "tab-btn tab-btn-active" : "tab-btn"} onClick={() => setTab("viewer")}>Version History</button>
        <button className={tab === "history" ? "tab-btn tab-btn-active" : "tab-btn"} onClick={() => setTab("history")}>Change Log</button>
        <button className={tab === "logs" ? "tab-btn tab-btn-active" : "tab-btn"} onClick={() => setTab("logs")}>Processing Logs</button>
        <button className={tab === "notifications" ? "tab-btn tab-btn-active" : "tab-btn"} onClick={() => setTab("notifications")}>Notifications</button>
      </div>

      <div className="tab-panel">
        {tab === "viewer" ? <div className="empty-box">Version history panel placeholder. Use this for document revisions and generated output snapshots.</div> : null}

        {tab === "history" ? (
          <div className="history-list">
            <div className="history-item"><strong>Document received</strong><span>{current.received_at || current.created_at || "-"}</span><em>{current.created_by || "system"}</em></div>
            <div className="history-item"><strong>Document processed</strong><span>{current.processed_at || current.updated_at || "-"}</span><em>{current.created_by || "system"}</em></div>
          </div>
        ) : null}

        {tab === "logs" ? (
          <table className="simple-table">
            <thead><tr><th>Time</th><th>Stage</th><th>Level</th><th>Message</th><th>User</th></tr></thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.log_id}>
                  <td>{log.log_time}</td><td>{log.stage}</td><td>{log.level}</td><td>{log.message}</td><td>{log.created_by ?? "system"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {tab === "notifications" ? (
          <table className="simple-table">
            <thead><tr><th>Time</th><th>Event</th><th>Status</th><th>Recipients</th><th>Subject</th><th>User</th></tr></thead>
            <tbody>
              {emails.map((row, index) => (
                <tr key={`${row.created_at ?? ""}-${index}`}>
                  <td>{row.created_at ?? "-"}</td><td>{row.event_type ?? "-"}</td><td>{row.status ?? "-"}</td><td>{row.recipients ?? "-"}</td><td>{row.subject ?? "-"}</td><td>{row.created_by ?? "system"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, value, editable }: { label: string; value?: string | number | null; editable: boolean; }) {
  return (
    <label className="field-card">
      <span>{label}</span>
      {editable ? <input defaultValue={value ?? ""} /> : <div className="field-value">{value ?? "-"}</div>}
    </label>
  );
}
