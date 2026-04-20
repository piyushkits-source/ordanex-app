import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";

type PO = {
  po_id: string;
  file_id?: string | null;
  po_number?: string | null;
  po_date?: string | null;
  docnum?: string | null;
  vendor_name?: string | null;
  supplier_name?: string | null;
  ship_to?: string | null;
  sold_to?: string | null;
  status?: string | null;
  items?: any[];
};

type FieldBox = {
  id: string;
  field: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Props = {
  po: PO;
  apiBase: string;
};

const MAPPING_FIELDS = ["po_number", "po_date", "vendor_name", "ship_to", "line_items_table"];
const EDITABLE_STATUSES = ["PENDING", "FAILED", "NEW", "ERROR", "BLOCKED"];

export default function ExpandedView({ po, apiBase }: Props) {
  const [detail, setDetail] = useState<any>(po);
  const [xml, setXml] = useState("");
  const [loading, setLoading] = useState(false);
  const [numPages, setNumPages] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [fileUrl, setFileUrl] = useState("");
  const [fileMimeType, setFileMimeType] = useState("");
  const [logs, setLogs] = useState<any[]>([]);
  const [emailHistory, setEmailHistory] = useState<any[]>([]);
  const [trace, setTrace] = useState<any>(null);
  const [fieldBoxes, setFieldBoxes] = useState<FieldBox[]>([]);
  const [selectedField, setSelectedField] = useState<string | null>("po_number");
  const [activeInfoPanel, setActiveInfoPanel] = useState<"log" | "download" | "flow">("log");
  const [draftBox, setDraftBox] = useState<{
    page: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);

  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const currentStatus = String(detail?.status || po?.status || "").toUpperCase();
  const isEditable = EDITABLE_STATUSES.includes(currentStatus);

  useEffect(() => {
    async function loadPoDetail() {
      try {
        const res = await fetch(`${apiBase}/purchase-orders/${po.po_id}`);
        if (!res.ok) return;
        const data = await res.json();
        setDetail(data);
      } catch (e) {
        console.error("PO detail load failed:", e);
      }
    }

    async function loadFileInfo() {
      try {
        const res = await fetch(`${apiBase}/files/by-po/${po.po_id}`);
        if (!res.ok) return;
        const data = await res.json();
        const file = data?.file;
        if (file?.file_id) {
          setFileUrl(`${apiBase}/files/${file.file_id}/download`);
          setFileMimeType(file.mime_type || "");
        }
      } catch (e) {
        console.error("File info load failed:", e);
      }
    }

    async function loadSideData() {
      try {
        const [logsRes, emailRes, traceRes, xmlRes] = await Promise.all([
          fetch(`${apiBase}/purchase-orders/${po.po_id}/logs`),
          fetch(`${apiBase}/purchase-orders/${po.po_id}/email-history`),
          fetch(`${apiBase}/processing-trace/${po.po_id}`),
          fetch(`${apiBase}/purchase-orders/${po.po_id}/xml`),
        ]);

        if (logsRes.ok) setLogs(await logsRes.json());
        if (emailRes.ok) setEmailHistory(await emailRes.json());
        if (traceRes.ok) setTrace(await traceRes.json());
        if (xmlRes.ok) {
          const xmlData = await xmlRes.json();
          setXml(xmlData?.xml_payload || "");
        }
      } catch (e) {
        console.error("Side panel load failed:", e);
      }
    }

    void loadPoDetail();
    void loadFileInfo();
    void loadSideData();
  }, [po.po_id, apiBase]);

  useEffect(() => {
    void loadFieldBoxes();
  }, [po.po_id]);

  async function loadFieldBoxes() {
    try {
      const res = await fetch(`${apiBase}/purchase-orders/${po.po_id}/field-boxes`);
      if (!res.ok) return;

      const data = await res.json();
      const boxes = Array.isArray(data?.field_boxes) ? data.field_boxes : [];
      setFieldBoxes(
        boxes.map((b: any, idx: number) => ({
          id: b.id || `${b.field}-${idx}`,
          field: b.field,
          page: Number(b.page || 1),
          x: Number(b.x || 0),
          y: Number(b.y || 0),
          width: Number(b.width || 0),
          height: Number(b.height || 0),
        }))
      );
    } catch (e) {
      console.error("Field boxes load failed:", e);
      setFieldBoxes([]);
    }
  }

  const mappedFields = useMemo(() => {
    const map: Record<string, boolean> = {};
    fieldBoxes.forEach((b) => {
      map[b.field] = true;
    });
    return map;
  }, [fieldBoxes]);

  const isPdf = fileMimeType.toLowerCase().includes("pdf") || fileUrl.toLowerCase().endsWith(".pdf");
  const isImage = fileMimeType.toLowerCase().startsWith("image/");

  async function autoDetect() {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/purchase-orders/${po.po_id}/auto-detect`, { method: "POST" });
      const data = await res.json();
      setDetail((prev: any) => ({
        ...prev,
        po_number: data.header?.po_number || prev.po_number,
        po_date: data.header?.po_date || prev.po_date,
        ship_to: data.header?.ship_to || prev.ship_to,
        supplier_name: data.vendor || prev.supplier_name,
        items: data.items || prev.items || [],
      }));
    } finally {
      setLoading(false);
    }
  }

  async function savePO() {
    await fetch(`${apiBase}/purchase-orders/${po.po_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(detail),
    });
    alert("Saved");
  }

  async function processPO() {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/purchase-orders/${po.po_id}/process`, { method: "POST" });
      const data = await res.json();
      setXml(data.xml || data.xml_payload || "");
    } finally {
      setLoading(false);
    }
  }

  async function saveMappings() {
    const payload = {
      boxes: fieldBoxes.map((b) => ({
        field: b.field,
        page: b.page,
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
      })),
    };

    await fetch(`${apiBase}/purchase-orders/${po.po_id}/field-boxes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    await loadFieldBoxes();
    alert("Mappings saved");
  }

  async function extractFromBoxes() {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/purchase-orders/${po.po_id}/extract-and-apply`, { method: "POST" });
      const data = await res.json();
      setDetail((prev: any) => ({
        ...prev,
        po_number: data.extracted?.po_number || prev.po_number,
        po_date: data.extracted?.po_date || prev.po_date,
        ship_to: data.extracted?.ship_to || prev.ship_to,
        supplier_name: data.extracted?.vendor_name || prev.supplier_name,
      }));
    } finally {
      setLoading(false);
    }
  }

  function updateField(field: string, value: any) {
    setDetail((prev: any) => ({ ...prev, [field]: value }));
  }

  function updateItem(index: number, field: string, value: any) {
    const updated = [...(detail.items || [])];
    updated[index] = { ...updated[index], [field]: value };
    setDetail({ ...detail, items: updated });
  }

  function addLineItem() {
    if (!isEditable) return;
    const nextLineNo = (detail.items || []).length > 0
      ? Math.max(...(detail.items || []).map((x: any) => Number(x.line_no || 0))) + 1
      : 1;

    const newItem = {
      line_no: nextLineNo,
      material_code: "",
      description: "",
      quantity: "",
      uom: "",
      unit_price: "",
      amount: "",
      delivery_date: "",
      plant: "",
    };

    setDetail((prev: any) => ({ ...prev, items: [...(prev.items || []), newItem] }));
  }

  function deleteLineItem(index: number) {
    if (!isEditable) return;
    setDetail((prev: any) => ({ ...prev, items: (prev.items || []).filter((_: any, i: number) => i !== index) }));
  }

  function getRelativeCoords(e: React.MouseEvent<HTMLDivElement>, pageNumber: number) {
    const pageEl = pageRefs.current[pageNumber];
    if (!pageEl) return null;
    const rect = pageEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    return { x, y };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>, pageNumber: number) {
    if (!selectedField || !isEditable || !isPdf) return;
    const pos = getRelativeCoords(e, pageNumber);
    if (!pos) return;
    setDraftBox({ page: pageNumber, startX: pos.x, startY: pos.y, endX: pos.x, endY: pos.y });
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>, pageNumber: number) {
    if (!draftBox || draftBox.page !== pageNumber || !isEditable || !isPdf) return;
    const pos = getRelativeCoords(e, pageNumber);
    if (!pos) return;
    setDraftBox((prev) => (prev ? { ...prev, endX: pos.x, endY: pos.y } : null));
  }

  function handleMouseUp() {
    if (!draftBox || !selectedField || !isEditable || !isPdf) return;
    const x = Math.min(draftBox.startX, draftBox.endX);
    const y = Math.min(draftBox.startY, draftBox.endY);
    const width = Math.abs(draftBox.endX - draftBox.startX);
    const height = Math.abs(draftBox.endY - draftBox.startY);
    if (width < 5 || height < 5) {
      setDraftBox(null);
      return;
    }
    const newBox: FieldBox = {
      id: `${selectedField}-${Date.now()}`,
      field: selectedField,
      page: draftBox.page,
      x,
      y,
      width,
      height,
    };
    const filtered = fieldBoxes.filter((b) => b.field !== selectedField);
    setFieldBoxes([...filtered, newBox]);
    setDraftBox(null);
  }

  function removeBox(fieldName: string) {
    if (!isEditable) return;
    setFieldBoxes((prev) => prev.filter((b) => b.field !== fieldName));
  }

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  return (
    <div className="expanded-shell-2col">
      <div className="left-pane">
        <div className="panel-header">
          <h3>Document</h3>
          <div className="toolbar">
            <button type="button" onClick={() => setScale((s) => Math.max(0.8, s - 0.2))}>−</button>
            <span>{Math.round(scale * 100)}%</span>
            <button type="button" onClick={() => setScale((s) => Math.min(2.4, s + 0.2))}>+</button>
          </div>
        </div>

        {!fileUrl ? (
          <div className="empty-box">No file attached</div>
        ) : isPdf ? (
          <div className="pdf-shell">
            <Document
              file={{ url: fileUrl, withCredentials: false }}
              loading={<div className="empty-box">Loading PDF...</div>}
              error={<div className="empty-box">Preview unavailable. Use download.</div>}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={(e) => console.error("PDF error:", e)}
            >
              {Array.from(new Array(numPages), (_, i) => {
                const pageNumber = i + 1;
                return (
                  <div
                    key={pageNumber}
                    className="pdf-page-wrap"
                    ref={(el) => {
                      pageRefs.current[pageNumber] = el;
                    }}
                    onMouseDown={(e) => handleMouseDown(e, pageNumber)}
                    onMouseMove={(e) => handleMouseMove(e, pageNumber)}
                    onMouseUp={handleMouseUp}
                  >
                    <Page pageNumber={pageNumber} scale={scale} />
                    <div className="bbox-overlay">
                      {fieldBoxes.filter((b) => b.page === pageNumber).map((box) => (
                        <button
                          key={box.id}
                          type="button"
                          className={selectedField === box.field ? "bbox selected" : "bbox"}
                          style={{
                            left: `${box.x * scale}px`,
                            top: `${box.y * scale}px`,
                            width: `${box.width * scale}px`,
                            height: `${box.height * scale}px`,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedField(box.field);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            removeBox(box.field);
                          }}
                          title={`${box.field} (actual value box)`}
                        />
                      ))}

                      {draftBox && draftBox.page === pageNumber ? (
                        <div
                          className="bbox draft"
                          style={{
                            left: `${Math.min(draftBox.startX, draftBox.endX) * scale}px`,
                            top: `${Math.min(draftBox.startY, draftBox.endY) * scale}px`,
                            width: `${Math.abs(draftBox.endX - draftBox.startX) * scale}px`,
                            height: `${Math.abs(draftBox.endY - draftBox.startY) * scale}px`,
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </Document>
          </div>
        ) : isImage ? (
          <div className="image-shell">
            <img src={fileUrl} alt="Document preview" className="image-preview" />
          </div>
        ) : (
          <div className="empty-box">
            Preview not available for this file type.
            <div style={{ marginTop: 10 }}>
              <a className="download-btn" href={fileUrl} target="_blank" rel="noreferrer">Download Original File</a>
            </div>
          </div>
        )}
      </div>

      <div className="right-pane">
        <div className="right-pane-header">
          <div className="panel-header compact-panel-header">
            <h2>Purchase Order</h2>
            <div className="action-row compact-action-row">
              <button onClick={autoDetect} disabled={!isEditable}>Auto Detect</button>
              <button onClick={savePO} disabled={!isEditable}>Save</button>
              <button onClick={processPO}>Process</button>
              <button onClick={saveMappings} disabled={!isEditable}>Save Mappings</button>
              <button onClick={extractFromBoxes} disabled={!isEditable}>Extract</button>
            </div>
          </div>
        </div>

        <div className="right-pane-body">
          {loading && <p>Processing...</p>}

          <div className="summary-card">
            <div className="summary-item"><span>PO Number</span><strong>{detail.po_number || "-"}</strong></div>
            <div className="summary-item"><span>Vendor</span><strong>{detail.vendor_name || detail.supplier_name || "-"}</strong></div>
            <div className="summary-item"><span>PO Date</span><strong>{detail.po_date || "-"}</strong></div>
            <div className="summary-item"><span>Status</span><strong>{currentStatus || "-"}</strong></div>
          </div>

          <div className="panel-section">
            <h3>Header Fields</h3>
            <div className="compact-form-grid">
              <div>
                <label>PO Number</label>
                <input value={detail.po_number || ""} onChange={(e) => updateField("po_number", e.target.value)} disabled={!isEditable} />
              </div>
              <div>
                <label>PO Date</label>
                <input value={detail.po_date || ""} onChange={(e) => updateField("po_date", e.target.value)} disabled={!isEditable} />
              </div>
              <div>
                <label>Vendor</label>
                <input value={detail.vendor_name || detail.supplier_name || ""} onChange={(e) => updateField("supplier_name", e.target.value)} disabled={!isEditable} />
              </div>
              <div>
                <label>Delivery Address</label>
                <input value={detail.ship_to || ""} onChange={(e) => updateField("ship_to", e.target.value)} disabled={!isEditable} />
              </div>
            </div>
          </div>

          <div className="panel-section">
            <h3>Field Mapping</h3>
            <p className="helper-text">Draw the box around the actual value, not the field label. For repeating line items, use the line_items_table box as a first-step table region.</p>
            <div className="mapping-list">
              {MAPPING_FIELDS.map((field) => (
                <button key={field} type="button" className={selectedField === field ? "mapping-item active" : "mapping-item"} onClick={() => setSelectedField(field)} disabled={!isEditable}>
                  <span>{field}</span>
                  <strong>{mappedFields[field] ? "Mapped" : "Not mapped yet"}</strong>
                </button>
              ))}
            </div>
          </div>

          <div className="panel-section">
            <div className="subpanel-head">
              <h3>Line Items</h3>
              <button onClick={addLineItem} disabled={!isEditable}>Add Line Item</button>
            </div>
            {(detail.items || []).length === 0 ? (
              <div className="empty-box compact">No line items available</div>
            ) : (
              (detail.items || []).map((item: any, i: number) => (
                <div key={i} className="item-card item-card-grid">
                  <div>
                    <label>Material</label>
                    <input value={item.material_code || item.material || ""} onChange={(e) => updateItem(i, "material_code", e.target.value)} disabled={!isEditable} />
                  </div>
                  <div>
                    <label>Description</label>
                    <input value={item.description || ""} onChange={(e) => updateItem(i, "description", e.target.value)} disabled={!isEditable} />
                  </div>
                  <div>
                    <label>Quantity</label>
                    <input value={item.quantity || ""} onChange={(e) => updateItem(i, "quantity", e.target.value)} disabled={!isEditable} />
                  </div>
                  <div>
                    <label>UOM</label>
                    <input value={item.uom || ""} onChange={(e) => updateItem(i, "uom", e.target.value)} disabled={!isEditable} />
                  </div>
                  <div>
                    <label>Unit Price</label>
                    <input value={item.unit_price || item.price || ""} onChange={(e) => updateItem(i, "unit_price", e.target.value)} disabled={!isEditable} />
                  </div>
                  <div>
                    <label>Amount</label>
                    <input value={item.amount || ""} onChange={(e) => updateItem(i, "amount", e.target.value)} disabled={!isEditable} />
                  </div>
                  <div>
                    <label>Delivery Date</label>
                    <input value={item.delivery_date || ""} onChange={(e) => updateItem(i, "delivery_date", e.target.value)} disabled={!isEditable} />
                  </div>
                  <div>
                    <label>Plant</label>
                    <input value={item.plant || ""} onChange={(e) => updateItem(i, "plant", e.target.value)} disabled={!isEditable} />
                  </div>
                  <div className="item-card-actions">
                    <button type="button" onClick={() => deleteLineItem(i)} disabled={!isEditable}>Delete Line</button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="quick-icons">
            <button className={activeInfoPanel === "log" ? "quick-icon-btn active" : "quick-icon-btn"} onClick={() => setActiveInfoPanel("log")}>📝 Action Log</button>
            <button className={activeInfoPanel === "download" ? "quick-icon-btn active" : "quick-icon-btn"} onClick={() => setActiveInfoPanel("download")}>⬇️ Download</button>
            <button className={activeInfoPanel === "flow" ? "quick-icon-btn active" : "quick-icon-btn"} onClick={() => setActiveInfoPanel("flow")}>🔄 Processing Flow</button>
          </div>

          {activeInfoPanel === "log" && (
            <div className="panel-section">
              <h3>Action Log</h3>
              <div className="icon-list">
                {logs.length === 0 ? <div className="empty-box compact">No action logs available</div> : logs.map((log: any) => (
                  <div key={log.log_id} className="log-card">
                    <div className="log-meta"><strong>{log.stage}</strong><span>{log.log_time}</span></div>
                    <div>{log.message}</div>
                    <div className="log-meta"><span>{log.level}</span><span>{log.created_by || "system"}</span></div>
                  </div>
                ))}
                {emailHistory.length > 0 && <h4>Email / Notification Activity</h4>}
                {emailHistory.map((entry: any, idx: number) => (
                  <div key={idx} className="log-card">
                    <div className="log-meta"><strong>{entry.event_type}</strong><span>{entry.created_at || "-"}</span></div>
                    <div>{entry.subject || "-"}</div>
                    <div className="log-meta"><span>{entry.status}</span><span>{entry.recipients || "-"}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeInfoPanel === "download" && (
            <div className="panel-section">
              <h3>Download Files</h3>
              <div className="download-grid">
                <a className="download-tile" href={fileUrl} target="_blank" rel="noreferrer">📄 Original File</a>
                {xml ? (
                  <a className="download-tile" href={`data:text/xml;charset=utf-8,${encodeURIComponent(xml)}`} download={`PO_${detail.po_number || "output"}.xml`}>🧾 XML Output</a>
                ) : (
                  <div className="download-tile disabled">🧾 XML Not Ready</div>
                )}
              </div>
            </div>
          )}

          {activeInfoPanel === "flow" && (
            <div className="panel-section">
              <h3>Processing Flow</h3>
              <div className="icon-list">
                {[
                  { label: "PO Received", value: trace?.created_at || po?.created_at, extra: detail.po_number || "-" },
                  { label: "Job Created", value: trace?.created_at, extra: po.po_id },
                  { label: "Data Transformed", value: trace?.mapping_resolution ? "Done" : null, extra: trace?.mapping_resolution ? "Mapping resolved" : "Pending" },
                  { label: "Rules Applied", value: trace?.applied_rules?.length ? "Done" : null, extra: `${trace?.applied_rules?.length || 0} rules` },
                  { label: "Validation", value: trace?.validation_hits ? "Checked" : null, extra: `${trace?.validation_hits?.length || 0} hits` },
                  { label: "PO Processed", value: detail?.processed_at || po?.processed_at, extra: detail?.status || "-" },
                  { label: "Recipient Delivery", value: detail?.delivered_at || po?.delivered_at, extra: detail?.receiver || "-" },
                ].map((step, idx) => (
                  <div key={idx} className="flow-card">
                    <div className="flow-meta"><strong>{step.label}</strong><span>{step.value || "Pending"}</span></div>
                    <div>{step.extra}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {xml && (
            <div className="panel-section">
              <h3>Generated IDOC XML</h3>
              <textarea value={xml} rows={10} readOnly />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
