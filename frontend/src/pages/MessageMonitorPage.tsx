import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import React from "react";
import { useSearchParams } from "react-router-dom";
import {
  FaFileCsv,
  FaFileExcel,
  FaSearch,
  FaSyncAlt,
  FaChevronDown,
  FaUserCircle,
} from "react-icons/fa";
import ExpandedMessageRow from "components/monitor/ExpandedMessageRow";
import "./message-monitor-premium.css";
import { getAuthHeaders } from "utils/auth";
import { useAppScope } from "context/AppScopeContext";

type MonitorRow = {
  po_id: string;
  po_number?: string | null;
  po_date?: string | null;
  docnum?: string | null;
  document_number?: string | null;
  transaction_id?: string | null;
  sender?: string | null;
  receiver?: string | null;
  supplier_name?: string | null;
  status?: string | null;
  direction?: string | null;
  created_at?: string | null;
  po_confidence?: string | null;
  source_type?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  raw_text?: string | null;
  xml_payload?: string | null;
  items?: any[];
  mappings?: any[];
  ship_to?: string | null;
  ship_to_partner?: any;
  sold_to_partner?: any;
  order_type?: string | null;
  po_type?: string | null;
  currency?: string | null;
};

type Counts = {
  total: number;
  processed: number;
  pending: number;
  errors: number;
};

type ActivityLog = {
  log_id?: string;
  po_id?: string;
  level?: string;
  stage?: string;
  message?: string;
  created_at?: string;
};

type ProcessingStep = {
  step_name?: string;
  stage?: string;
  status?: string;
  created_at?: string;
};

const API_BASE = "";

export default function MessageMonitorPage() {
  const { scope, setEnvironmentScope } = useAppScope();
  const [searchParams] = useSearchParams();
  const initialPoId = searchParams.get("po_id") || "";
  const initialClientId = searchParams.get("client_id") || "";
  const initialEnvironment = (searchParams.get("environment") || "").toUpperCase();
  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [environment, setEnvironment] = useState(initialEnvironment || scope.environment || "PROD");
  const [direction, setDirection] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const [activityLogsByPo, setActivityLogsByPo] = useState<
    Record<string, ActivityLog[]>
  >({});
  const [processingFlowByPo, setProcessingFlowByPo] = useState<
    Record<string, ProcessingStep[]>
  >({});
  const isRefreshingRef = useRef(false);
  function resolveMessageType(row: any): string {
    return (
      row?.messageType ||
      row?.message_type ||
      row?.message_family ||
      row?.document_type ||
      row?.po_type ||
      row?.order_type ||
      "UNKNOWN"
    );
  }

  function normalizeMonitorRow(row: any): MonitorRow {
    if (!row) return row;

    return {
      ...row,
      id: row.id || row.po_id || "",
      documentId: row.docnum || row.documentId || row.po_id || "",
      messageType: resolveMessageType(row),
      message_type: row.message_type || row.messageType || resolveMessageType(row),
      message_family: row.message_family || row.document_type || row.po_type || row.order_type || resolveMessageType(row),
      document_type: row.document_type || row.po_type || row.message_family || resolveMessageType(row),
      transactionNumber:
        row.transactionNumber ||
        row.transaction_id ||
        row.invoice_number ||
        row.billing_document_number ||
        row.reference_po_number ||
        row.po_number ||
        row.docnum ||
        "",
      direction: row.direction || row.message_direction || row.flow_direction || undefined,
      environment: row.environment || "PROD",
      receivedAt: row.receivedAt || row.received_at || row.created_at || "",
      fileUrl: row.fileUrl || row.file_url || undefined,
      fileName: row.fileName || row.file_name || undefined,
      mimeType: row.mimeType || row.mime_type || undefined,
      rawText: row.rawText || row.raw_text || undefined,
      transformedXml: row.transformedXml || row.xml_payload || undefined,
      fields: row.fields || row.mappings || [],
      lineItems: row.lineItems || row.items || [],
      invoice_number: row.invoice_number || null,
      invoice_date: row.invoice_date || null,
      billing_document_number: row.billing_document_number || null,
      reference_po_number: row.reference_po_number || null,
      invoice_total: row.invoice_total || null,
    } as MonitorRow;
  }


  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [rows]);

  const loadQueue = useCallback(async () => {
    if (isRefreshingRef.current) {
      return;
    }

    isRefreshingRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        environment,
        direction,
        status_filter: statusFilter,
        search,
        fromDate,
        toDate,
      });
      if (scope.clientId) {
        params.set("client_id", scope.clientId);
      } else if (initialClientId) {
        params.set("client_id", initialClientId);
      }
      if (initialPoId) {
        params.set("po_id", initialPoId);
      }
      console.log("statusFilter sent =", statusFilter);
      const res = await fetch(`${API_BASE}/monitoring/queue?${params.toString()}`, {
        headers: getAuthHeaders(),
        cache: "no-store",
      });
      const data = await res.json();
      console.log("first queue row after refresh =", Array.isArray(data) ? data[0] : data);
      const nextRows = Array.isArray(data) ? data : data.items || [];
      setRows(nextRows.map(normalizeMonitorRow));
    } catch (err) {
      console.error("Queue load failed", err);
      setRows([]);
    } finally {
      isRefreshingRef.current = false;
      setLoading(false);
    }
  }, [direction, environment, fromDate, initialClientId, initialPoId, scope.clientId, search, statusFilter, toDate]);

  useEffect(() => {
    setEnvironment(initialEnvironment || scope.environment || "PROD");
  }, [initialEnvironment, scope.environment]);

  useEffect(() => {
    if (!initialPoId) return;
    setExpandedRowId(initialPoId);
  }, [initialPoId]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (!initialPoId) return;
    const matched = rows.find((row) => row.po_id === initialPoId);
    if (!matched) return;
    setExpandedRowId(initialPoId);
    void Promise.all([
      loadActivityLogs(initialPoId),
      loadProcessingFlow(initialPoId),
    ]);
  }, [initialPoId, rows]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadQueue();
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [loadQueue]);

  useEffect(() => {
    function handleVisibilityOrFocus() {
      if (document.visibilityState === "visible") {
        loadQueue();
      }
    }

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [loadQueue]);

  const counts: Counts = useMemo(() => {
    const total = sortedRows.length;
    const processed = sortedRows.filter((r) =>
      ["PROCESSED", "SUCCESS"].includes((r.status || "").toUpperCase())
    ).length;
    const pending = sortedRows.filter((r) =>
      ["NEW", "PENDING", "ERROR", "FAILED", "CORRECTED"].includes(
        (r.status || "").toUpperCase()
      )
    ).length;
    const errors = sortedRows.filter((r) =>
      ["ERROR", "FAILED"].includes((r.status || "").toUpperCase())
    ).length;

    return { total, processed, pending, errors };
  }, [sortedRows]);

  function formatDateTime(value?: string | null) {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  }

  async function loadActivityLogs(poId: string) {
    try {
      const res = await fetch(`${API_BASE}/monitoring/${poId}/activity-logs`, { headers: getAuthHeaders() });
      const data = await res.json();
      setActivityLogsByPo((prev) => ({
        ...prev,
        [poId]: Array.isArray(data) ? data : [],
      }));
    } catch (err) {
      console.error("Activity log load failed", err);
      setActivityLogsByPo((prev) => ({ ...prev, [poId]: [] }));
    }
  }

  async function loadProcessingFlow(poId: string) {
    try {
      const res = await fetch(`${API_BASE}/monitoring/${poId}/processing-flow`, { headers: getAuthHeaders() });
      const data = await res.json();
      setProcessingFlowByPo((prev) => ({
        ...prev,
        [poId]: Array.isArray(data) ? data : [],
      }));
    } catch (err) {
      console.error("Processing flow load failed", err);
      setProcessingFlowByPo((prev) => ({ ...prev, [poId]: [] }));
    }
  }

  async function toggleExpand(row: MonitorRow) {
    const nextId = expandedRowId === row.po_id ? null : row.po_id;
    setExpandedRowId(nextId);

    if (nextId) {
      await Promise.all([
        loadActivityLogs(row.po_id),
        loadProcessingFlow(row.po_id),
      ]);
    }
  }

  function statusClass(status?: string | null) {
    const s = (status || "").toUpperCase();
    if (["PROCESSED", "SUCCESS"].includes(s)) return "success";
    if (["ERROR", "FAILED"].includes(s)) return "error";
    if (["NEW", "PENDING", "CORRECTED"].includes(s)) return "pending";
    if (["PROCESSING", "REPROCESSING", "TRANSFORMED"].includes(s))
      return "progress";
    return "neutral";
  }

  function confidenceClass(value?: string | null) {
    const v = (value || "").toUpperCase();
    if (v === "HIGH") return "high";
    if (v === "MEDIUM") return "medium";
    return "low";
  }

  function exportCsv() {
    const headers = [
      "Status",
      "Document ID",
      "Message Type",
      "Sender",
      "Receiver",
      "Transaction ID",
      "Created At",
    ];

    const lines = sortedRows.map((r) => [
      r.status || "",
      r.documentId || r.docnum || r.po_id || "",
      resolveMessageType(r),
      r.sender || "",
      r.receiver || "",
      r.docnum || r.document_number || r.po_number || "",
      r.created_at || "",
    ]);

    const csv = [headers, ...lines]
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    downloadBlob(csv, "text/csv;charset=utf-8", "ordanex-monitor.csv");
  }

  function exportExcel() {
    const headers = [
      "Status",
      "Document ID",
      "Message Type",
      "Sender",
      "Receiver",
      "Transaction ID",
      "Created At",
    ];

    const rowsText = sortedRows
      .map(
        (r) => `
        <tr>
          <td>${escapeHtml(r.status || "")}</td>
          <td>${escapeHtml(r.documentId || r.docnum || r.po_id || "")}</td>
          <td>{escapeHtml(resolveMessageType(r))}</td>
          <td>${escapeHtml(r.sender || "")}</td>
          <td>${escapeHtml(r.receiver || "")}</td>
          <td>${escapeHtml(
            r.docnum || r.document_number || r.po_number || ""
          )}</td>
          <td>${escapeHtml(r.created_at || "")}</td>
        </tr>`
      )
      .join("");

    const html = `
      <html>
        <head><meta charset="utf-8" /></head>
        <body>
          <table>
            <thead>
              <tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>
            </thead>
            <tbody>${rowsText}</tbody>
          </table>
        </body>
      </html>
    `;

    downloadBlob(
      html,
      "application/vnd.ms-excel;charset=utf-8",
      "ordanex-monitor.xls"
    );
  }

  return (
    <div className="monitor-shell">
      

      <section className="kpi-row">
        <KpiCard label="Total Messages" value={counts.total} />
        <KpiCard label="Processed" value={counts.processed} />
        <KpiCard label="Pending" value={counts.pending} />
        <KpiCard label="Errors" value={counts.errors} />
      </section>

      <section className="toolbar-card">
        <div className="toolbar-row toolbar-row-main">
          <div className="search-wrap">
            <FaSearch className="search-icon" />
            <input
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sender, receiver, document number"
            />
          </div>

          <button className="primary-btn" onClick={loadQueue}>
            Search
          </button>

          <div className="date-group">
            <label className="date-label">From</label>
            <input
              className="date-input"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div className="date-group">
            <label className="date-label">To</label>
            <input
              className="date-input"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>

        <div className="toolbar-row toolbar-row-filters">
          <select
            className="filter-select"
            value={environment}
            onChange={(e) => {
              setEnvironment(e.target.value);
              setEnvironmentScope(e.target.value);
            }}
          >
            <option value="PROD">Production</option>
            <option value="STAGING">Staging</option>
          </select>

          <select
            className="filter-select"
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
          >
            <option value="ALL">All Directions</option>
            <option value="INBOUND">Inbound</option>
            <option value="OUTBOUND">Outbound</option>
          </select>

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="SUCCESSFUL">Successful</option>
            <option value="ARCHIVE">Archive</option>
          </select>

          <div className="toolbar-actions">
            <button className="icon-btn" title="Download CSV" onClick={exportCsv}>
              <FaFileCsv />
            </button>
            <button className="icon-btn" title="Download Excel" onClick={exportExcel}>
              <FaFileExcel />
            </button>
          </div>
        </div>
      </section>

      <section className="table-card">
        <div className="table-headline simple">
          <div className="headline-left">
            <span className="headline-title">Message Queue</span>
          </div>
        </div>

        <div className="table-wrap">
          <table className="monitor-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Document ID</th>
                <th>Message Type</th>
                <th>Sender</th>
                <th>Receiver</th>
                <th>Created At</th>
                <th>Confidence</th>
                <th>Source</th>
                <th>Transaction ID</th>
              </tr>
            </thead>

            <tbody>
              {sortedRows.map((row) => {
                const isExpanded = expandedRowId === row.po_id;

                return (
                  <React.Fragment key={row.po_id}>
                    <tr
                      onClick={() => {
                        const nextExpanded = isExpanded ? null : row.po_id;
                        setExpandedRowId(nextExpanded);
                        setSelectedField(null);

                        if (!isExpanded) {
                          loadActivityLogs(row.po_id);
                          loadProcessingFlow(row.po_id);
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <td>{row.status || "-"}</td>
                      <td>{(row as any).documentId || (row as any).docnum || row.po_id || "-"}</td>
                      <td>{resolveMessageType(row as any)}</td>
                      <td>{(row as any).sender || "-"}</td>
                      <td>{(row as any).receiver || (row as any).supplier_name || "-"}</td>
                      <td>{formatDateTime((row as any).created_at)}</td>
                      <td>{(row as any).po_confidence || ((row.items || []).length ? "MEDIUM" : "LOW")}</td>
                      <td>{(row as any).source_type || "-"}</td>
                      <td>{(row as any).transactionNumber || (row as any).transaction_id || (row as any).document_number || row.po_number || (row as any).docnum || "-"}</td>
                    </tr>

                    {isExpanded && (
                      <tr key={`expanded-${row.po_id}`}>
                        <td colSpan={9} style={{ padding: 0 }}>
                          <ExpandedRowErrorBoundary rowId={row.po_id}>
                          <ExpandedMessageRow
                            key={`expanded-row-${row.po_id}-${(row as any).created_at || ""}-${(row as any).status || ""}`}
                            row={row}
                            selectedField={selectedField}
                            onSelectField={setSelectedField}
                            activityLogs={activityLogsByPo[row.po_id] || []}
                            processingFlow={processingFlowByPo[row.po_id] || []}
                            onRefresh={loadQueue}
                          />
                      </ExpandedRowErrorBoundary>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

function renderStatusLabel(status?: string | null) {
  const s = (status || "").toUpperCase();
  if (["NEW", "PENDING", "CORRECTED"].includes(s)) return "Pending";
  if (["ERROR", "FAILED"].includes(s)) return "Error";
  if (["PROCESSING", "REPROCESSING", "TRANSFORMED"].includes(s)) return "In Progress";
  if (["PROCESSED", "SUCCESS"].includes(s)) return "Processed";
  return status || "Unknown";
}

function downloadBlob(content: string, mime: string, fileName: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

class ExpandedRowErrorBoundary extends React.Component<
  { rowId: string; children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { rowId: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || "Unknown viewer error" };
  }

  componentDidCatch(error: Error) {
    console.error(`Expanded row render failed for ${this.props.rowId}:`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 16,
            margin: 0,
            background: "#fff7ed",
            borderTop: "1px solid #fed7aa",
            borderBottom: "1px solid #fed7aa",
            color: "#9a3412",
            fontSize: 13,
          }}
        >
          This message could not be rendered safely. {this.state.message}
        </div>
      );
    }

    return this.props.children;
  }
}
