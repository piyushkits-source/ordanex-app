import { useEffect, useMemo, useState } from "react";
import {
  FaDownload,
  FaFilePdf,
  FaHistory,
  FaProjectDiagram,
  FaExclamationCircle,
  FaList,
  FaFileCode,
} from "react-icons/fa";
import type {
  MonitoringRow,
  MappingField,
  ActivityLog,
  ProcessingStep,
} from "../../types/monitoring";

type Props = {
  row: MonitoringRow;
  mappings: MappingField[];
  selectedField: string | null;
  onSelectField: (key: string) => void;
  activityLogs: ActivityLog[];
  processingFlow: ProcessingStep[];
  onRefresh?: () => void | Promise<void>;
  onSave?: () => void | Promise<void>;
  onSaveAndReprocess?: () => void | Promise<void>;
  onArchive?: (reason: string, comment: string) => void | Promise<void>;
  onRaiseIssue?: (payload: {
    issueType: string;
    comments: string;
    row: MonitoringRow;
    mappings: MappingField[];
  }) => void | Promise<void>;
  headerState: any;
  onHeaderStateChange: React.Dispatch<React.SetStateAction<any>>;
  itemsState: any[];
  onItemsStateChange: React.Dispatch<React.SetStateAction<any[]>>;
  uiMessage?: { type: "success" | "error"; text: string } | null;
  onClearUiMessage?: () => void;
  onHeaderFieldDirty: (field: string) => void;
  onItemFieldDirty: (index: number, field: string) => void;
};

export default function MessageDetailsPanel({
  row,
  mappings,
  selectedField,
  onSelectField,
  activityLogs,
  processingFlow,
  onSave,
  onSaveAndReprocess,
  onArchive,
  onRaiseIssue,
  headerState,
  onHeaderStateChange,
  itemsState,
  onItemsStateChange,
  uiMessage,
  onClearUiMessage,
  onHeaderFieldDirty,
  onItemFieldDirty,
}: Props) {
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showProcessingFlow, setShowProcessingFlow] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveReason, setArchiveReason] = useState("Not valid");
  const [archiveComment, setArchiveComment] = useState("");
  const [issueType, setIssueType] = useState("DATA_EXTRACTION");
  const [issueComments, setIssueComments] = useState("");

  const normalizedStatus = (row.status || "").toUpperCase();
  const canEditActions = ["NEW", "PENDING", "ERROR", "FAILED", "CORRECTED"].includes(
    normalizedStatus
  );
  const messageFamily = String(
    row.message_family || row.message_type || row.po_type || row.order_type || "PO"
  ).toUpperCase();
  const familyLayout = {
    PO: {
      documentLabel: "Document Number",
      documentDateLabel: "Document Date",
      orderReferenceLabel: "Order Type",
      taxIdLabel: "Language Code",
      lineSectionTitle: "Delivery",
    },
    ORDERS: {
      documentLabel: "Order Number",
      documentDateLabel: "Order Date",
      orderReferenceLabel: "Order Type",
      taxIdLabel: "Language Code",
      lineSectionTitle: "Order Line",
    },
    ORDCHG: {
      documentLabel: "Change Number",
      documentDateLabel: "Change Date",
      orderReferenceLabel: "Reference Order Number",
      taxIdLabel: "Language Code",
      lineSectionTitle: "Change Line",
    },
    ORDRSP: {
      documentLabel: "Response Number",
      documentDateLabel: "Response Date",
      orderReferenceLabel: "Reference Order Number",
      taxIdLabel: "Language Code",
      lineSectionTitle: "Response Line",
    },
    ASN: {
      documentLabel: "ASN Number",
      documentDateLabel: "ASN Date",
      orderReferenceLabel: "Shipment Reference",
      taxIdLabel: "Language Code",
      lineSectionTitle: "ASN Line",
    },
    DESADV: {
      documentLabel: "ASN Number",
      documentDateLabel: "ASN Date",
      orderReferenceLabel: "Shipment Reference",
      taxIdLabel: "Language Code",
      lineSectionTitle: "ASN Line",
    },
    INVOICE: {
      documentLabel: "Billing Document Number",
      documentDateLabel: "Billing Date",
      orderReferenceLabel: "Reference PO Number",
      taxIdLabel: "TAX ID",
      lineSectionTitle: "Invoice Line",
    },
    AP_INVOICE: {
      documentLabel: "Billing Document Number",
      documentDateLabel: "Billing Date",
      orderReferenceLabel: "Reference PO Number",
      taxIdLabel: "TAX ID",
      lineSectionTitle: "Invoice Line",
    },
    AR_INVOICE: {
      documentLabel: "Billing Document Number",
      documentDateLabel: "Billing Date",
      orderReferenceLabel: "Reference PO Number",
      taxIdLabel: "TAX ID",
      lineSectionTitle: "Invoice Line",
    },
  } as const;
  const activeLayout = familyLayout[messageFamily as keyof typeof familyLayout] ?? familyLayout.PO;
  const isInvoiceDocument = ["INVOICE", "AP_INVOICE", "AR_INVOICE"].includes(messageFamily);
  const documentLabel = activeLayout.documentLabel;
  const documentDateLabel = activeLayout.documentDateLabel;
  const orderReferenceLabel = activeLayout.orderReferenceLabel;
  const taxIdLabel = activeLayout.taxIdLabel;
  const lineSectionTitle = activeLayout.lineSectionTitle;

  const mappingMap = useMemo(() => {
    const map: Record<string, any> = {};
    (mappings || []).forEach((m) => {
      if (m?.key) map[m.key] = m;
    });
    return map;
  }, [mappings]);

  const missingFieldSet = useMemo(
    () => new Set((row.missing_required_fields || []).map((field) => String(field))),
    [row.missing_required_fields]
  );

  function isFieldMissing(...keys: string[]) {
    return keys.some((key) => missingFieldSet.has(key));
  }

  useEffect(() => {
    if (!selectedField) return;

    const m = mappingMap[selectedField];
    if (!m) return;

    const val = m.value ?? m.text;
    if (val === undefined || val === null || val === "") return;

    if (!selectedField.startsWith("items.")) {
      onHeaderStateChange((prev: any) => ({
        ...prev,
        [selectedField]: val,
      }));
      return;
    }

    const parts = selectedField.split(".");
    const idx = Number(parts[1]);
    const field = parts[2];

    if (Number.isNaN(idx)) return;

    onItemsStateChange((prev) => {
      const next = [...prev];
      if (!next[idx]) return prev;
      if (field === "customer_uom") {
        next[idx] = { ...next[idx], customer_uom: val, uom: val };
      } else {
        next[idx] = { ...next[idx], [field]: val };
      }
      return next;
    });
  }, [selectedField, mappingMap, onHeaderStateChange, onItemsStateChange]);

  function updateHeader(key: string, value: any) {
    onHeaderStateChange((prev: any) => ({ ...prev, [key]: value }));
    onHeaderFieldDirty(key);
  }

  function updateItem(index: number, key: string, value: any) {
    const next = [...itemsState];
    next[index] =
      key === "customer_uom"
        ? { ...next[index], customer_uom: value, uom: value }
        : { ...next[index], [key]: value };
    onItemsStateChange(next);
    onItemFieldDirty(index, key);
  }

  function addLineItem() {
    const nextLineNo =
      (itemsState || [])
        .filter((item: any) => !item?.is_deleted)
        .reduce((max: number, item: any) => Math.max(max, Number(item?.line_no || 0)), 0) + 1;

    onItemsStateChange((prev) => [
      ...prev,
      {
        line_no: nextLineNo,
        material_code: "",
        mapped_product: "",
        description: "",
        line_details: "",
        quantity: "",
        mapped_quantity: "",
        customer_uom: "",
        uom: "",
        supplier_uom_conversion_factor: "",
        unit_price: "",
        amount: "",
        allowance_discount_surcharge: "",
        tax_amount: "",
        line_total_amount: "",
        delivery_date: "",
        delivery_time: "",
        ship_to_override: "",
      },
    ]);
  }

  function deleteLineItem(index: number) {
    onItemsStateChange((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;

      if (current.id) {
        next[index] = { ...current, is_deleted: true };
      } else {
        next.splice(index, 1);
      }
      return next;
    });
  }

  const handleDownloadXml = () => {
    window.open(`/purchase-orders/${row.po_id}/download/target`, "_blank");
  };

  const handleDownloadOriginal = () => {
    if ((row as any).file_url) window.open((row as any).file_url, "_blank");
  };

  const handleDownloadCanonical = () => {
    window.open(`/purchase-orders/${row.po_id}/download/canonical`, "_blank");
  };

  async function submitIssue() {
    const autoContext = `
  PO Number: ${(row as any).po_number || "-"}
  PO ID: ${row.po_id}
  Customer: ${(row as any).sender || "-"}
  Supplier: ${(row as any).receiver || (row as any).supplier_name || "-"}
  Status: ${(row as any).status || "-"}
  Please describe the exact issue below:
  ${issueComments || ""}
    `.trim();

    await onRaiseIssue?.({
      issueType,
      comments: autoContext,
      row,
      mappings,
    });
    setShowIssueModal(false);
    setIssueComments("");
    setIssueType("DATA_EXTRACTION");
  }

  async function submitArchive() {
    await onArchive?.(archiveReason, archiveComment);
    setShowArchiveModal(false);
    setArchiveComment("");
    setArchiveReason("Not valid");
  }

  function fieldMeta(key: string) {
    return mappingMap[key] || null;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        height: "100%",
        position: "relative",
      }}
    >
      {!!uiMessage && (
        <div
          style={{
            border: `1px solid ${
              uiMessage.type === "success" ? "#bbf7d0" : "#fecaca"
            }`,
            background: uiMessage.type === "success" ? "#f0fdf4" : "#fef2f2",
            color: uiMessage.type === "success" ? "#166534" : "#b91c1c",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5 }}>
            {uiMessage.text}
          </div>
          <button
            type="button"
            onClick={onClearUiMessage}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "inherit",
              fontWeight: 800,
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <IconButton
            title="Fields"
            onClick={() => {
              setShowActivityLog(false);
              setShowProcessingFlow(false);
            }}
            icon={<FaList size={14} />}
          />
          <IconButton
            title="Activity Log"
            onClick={() => {
              setShowActivityLog((v) => !v);
              setShowProcessingFlow(false);
            }}
            icon={<FaHistory size={14} />}
          />
          <IconButton
            title="Processing Flow"
            onClick={() => {
              setShowProcessingFlow((v) => !v);
              setShowActivityLog(false);
            }}
            icon={<FaProjectDiagram size={14} />}
          />
          <IconButton
            title="Download Original Document"
            onClick={handleDownloadOriginal}
            icon={<FaFilePdf size={14} />}
          />
          <IconButton
            title="Download XML"
            onClick={handleDownloadXml}
            icon={<FaDownload size={14} />}
          />
          <IconButton
            title="Download Canonical"
            onClick={handleDownloadCanonical}
            icon={<FaFileCode size={14} />}
          />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <StatusBadge label={row.status || "UNKNOWN"} />
          {(row as any).po_confidence ? (
            <ConfidenceBadge label={(row as any).po_confidence} />
          ) : null}
        </div>
      </div>

      {canEditActions && (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            flexWrap: "wrap",
            background: "#ffffff",
            padding: "10px 0",
            borderBottom: "1px solid #eef2f7",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowArchiveModal(true);
            }}
            style={secondaryActionBtn}
          >
            Archive
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSave?.();
            }}
            style={secondaryActionBtn}
          >
            Save
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSaveAndReprocess?.();
            }}
            style={primaryActionBtn}
          >
            Save &amp; Reprocess
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowIssueModal(true);
            }}
            style={issueActionBtn}
          >
            <FaExclamationCircle style={{ marginRight: 6 }} />
            Raise Issue
          </button>
        </div>
      )}

      <TopMetaBar row={row} />

      {!!(row.processing_block_reason || row.missing_required_fields?.length) && (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: 12,
            padding: "12px 14px",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {row.processing_block_reason || "Automatic processing is blocked until the missing required fields are completed."}
          </div>
          {!!row.missing_required_fields?.length && (
            <div>
              Missing fields: {(row.missing_required_fields || []).join(", ")}
            </div>
          )}
        </div>
      )}

      {showActivityLog && (
        <SectionShell title="Activity Log">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(activityLogs || []).length ? (
              activityLogs.map((log: any, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #eef2f7",
                    borderRadius: 10,
                    background: "#fafbfc",
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600, color: "#0f172a" }}>
                    {log.stage || log.level || "Activity"}
                  </div>
                  <div style={{ color: "#475569", marginTop: 4 }}>
                    {log.message || "-"}
                  </div>
                  {(log.actor_email || log.actor_type) && (
                    <div style={{ color: "#64748b", marginTop: 4, fontSize: 12 }}>
                      {(log.actor_type || "SYSTEM").toString()} {log.actor_email ? `• ${log.actor_email}` : ""}
                    </div>
                  )}
                  {!!log.changed_fields &&
                    typeof log.changed_fields === "object" &&
                    Object.entries(log.changed_fields)
                      .filter(([key]) => key !== "session_id")
                      .slice(0, 6)
                      .map(([key, value]) => {
                        const rendered =
                          value && typeof value === "object"
                            ? `${(value as any).old ?? "-"} -> ${(value as any).new ?? "-"}`
                            : String(value ?? "-");
                        return (
                          <div
                            key={`${idx}-${key}`}
                            style={{ color: "#64748b", marginTop: 4, fontSize: 12 }}
                          >
                            {key}: {rendered}
                          </div>
                        );
                      })}
                  <div style={{ color: "#94a3b8", marginTop: 4, fontSize: 12 }}>
                    {log.timestamp || log.created_at || ""}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: "#64748b", fontSize: 13 }}>
                No activity logs available.
              </div>
            )}
          </div>
        </SectionShell>
      )}

      {showProcessingFlow && (
        <SectionShell title="Processing Flow">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(processingFlow || []).length ? (
              processingFlow.map((step: any, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #eef2f7",
                    borderRadius: 10,
                    background: "#fafbfc",
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600, color: "#0f172a" }}>
                    {step.name || step.step_name || step.stage || `Step ${idx + 1}`}
                  </div>

                  <div style={{ color: "#475569", marginTop: 4 }}>
                    {step.status || ""}
                  </div>

                  {!!step.details && (
                    <div style={{ color: "#64748b", marginTop: 4 }}>{step.details}</div>
                  )}

                  <div style={{ color: "#94a3b8", marginTop: 4, fontSize: 12 }}>
                    {step.timestamp || step.created_at || ""}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: "#64748b", fontSize: 13 }}>
                No processing steps available.
              </div>
            )}
          </div>
        </SectionShell>
      )}

      <SectionShell title="Document Information">
        {isInvoiceDocument ? (
          <>
            <div style={grid4}>
              <FieldTile
                label={documentLabel}
                active={isActive(selectedField, "document_number", "po_number")}
                onClick={() => onSelectField("document_number")}
                meta={fieldMeta("document_number")}
                missing={isFieldMissing("document_number", "po_number")}
              >
                <input
                  value={headerState.document_number ?? (headerState.invoice_number ?? headerState.billing_document_number ?? "")}
                  onChange={(e) => updateHeader("document_number", e.target.value)}
                  onFocus={() => onSelectField("document_number")}
                  style={inputStyle(isActive(selectedField, "document_number", "po_number"), isFieldMissing("document_number", "po_number"))}
                />
              </FieldTile>

              <FieldTile
                label={documentDateLabel}
                active={isActive(selectedField, "document_date", "po_date")}
                onClick={() => onSelectField("document_date")}
                meta={fieldMeta("document_date")}
                missing={isFieldMissing("document_date", "po_date")}
              >
                <input
                  value={headerState.document_date ?? (headerState.billing_date ?? headerState.invoice_date ?? "")}
                  onChange={(e) => updateHeader("document_date", e.target.value)}
                  onFocus={() => onSelectField("document_date")}
                  style={inputStyle(isActive(selectedField, "document_date", "po_date"), isFieldMissing("document_date", "po_date"))}
                />
              </FieldTile>

              <FieldTile
                label="Customer"
                active={selectedField === "customer_name"}
                onClick={() => onSelectField("customer_name")}
                meta={fieldMeta("customer_name")}
                missing={isFieldMissing("customer_name")}
              >
                <input
                  value={headerState.customer_name ?? ""}
                  onChange={(e) => updateHeader("customer_name", e.target.value)}
                  onFocus={() => onSelectField("customer_name")}
                  style={inputStyle(selectedField === "customer_name", isFieldMissing("customer_name"))}
                />
              </FieldTile>

              <FieldTile
                label="Supplier"
                active={selectedField === "supplier_name"}
                onClick={() => onSelectField("supplier_name")}
                meta={fieldMeta("supplier_name")}
                missing={isFieldMissing("supplier_name")}
              >
                <input
                  value={headerState.supplier_name ?? ""}
                  onChange={(e) => updateHeader("supplier_name", e.target.value)}
                  onFocus={() => onSelectField("supplier_name")}
                  style={inputStyle(selectedField === "supplier_name", isFieldMissing("supplier_name"))}
                />
              </FieldTile>
            </div>

            <div style={{ ...grid3, marginTop: 10 }}>
              <FieldTile
                label={orderReferenceLabel}
                active={selectedField === "reference_po_number"}
                onClick={() => onSelectField("reference_po_number")}
                meta={fieldMeta("reference_po_number")}
                missing={isFieldMissing("reference_po_number")}
              >
                <input
                  value={headerState.reference_po_number ?? headerState.order_type ?? ""}
                  onChange={(e) => updateHeader("reference_po_number", e.target.value)}
                  onFocus={() => onSelectField("reference_po_number")}
                  style={inputStyle(selectedField === "reference_po_number", isFieldMissing("reference_po_number"))}
                />
              </FieldTile>

              <FieldTile
                label={taxIdLabel}
                active={selectedField === "tax_id"}
                onClick={() => onSelectField("tax_id")}
                meta={fieldMeta("tax_id")}
                missing={isFieldMissing("tax_id")}
              >
                <input
                  value={headerState.tax_id ?? ""}
                  onChange={(e) => updateHeader("tax_id", e.target.value)}
                  onFocus={() => onSelectField("tax_id")}
                  style={inputStyle(selectedField === "tax_id", isFieldMissing("tax_id"))}
                />
              </FieldTile>

              <FieldTile
                label="Currency Code"
                active={selectedField === "currency_code"}
                onClick={() => onSelectField("currency_code")}
                meta={fieldMeta("currency_code")}
                missing={isFieldMissing("currency_code")}
              >
                <input
                  value={headerState.currency_code ?? ""}
                  onChange={(e) => updateHeader("currency_code", e.target.value)}
                  onFocus={() => onSelectField("currency_code")}
                  style={inputStyle(selectedField === "currency_code", isFieldMissing("currency_code"))}
                />
              </FieldTile>
            </div>
          </>
        ) : (
          <>
            <div style={grid4}>
              <FieldTile
                label={documentLabel}
                active={isActive(selectedField, "document_number", "po_number")}
                onClick={() => onSelectField("document_number")}
                meta={fieldMeta("document_number")}
                missing={isFieldMissing("document_number", "po_number")}
              >
                <input
                  value={headerState.document_number ?? (headerState.invoice_number ?? headerState.billing_document_number ?? "")}
                  onChange={(e) => updateHeader("document_number", e.target.value)}
                  onFocus={() => onSelectField("document_number")}
                  style={inputStyle(isActive(selectedField, "document_number", "po_number"), isFieldMissing("document_number", "po_number"))}
                />
              </FieldTile>

              <FieldTile
                label={documentDateLabel}
                active={isActive(selectedField, "document_date", "po_date")}
                onClick={() => onSelectField("document_date")}
                meta={fieldMeta("document_date")}
                missing={isFieldMissing("document_date", "po_date")}
              >
                <input
                  value={headerState.document_date ?? (headerState.billing_date ?? headerState.invoice_date ?? "")}
                  onChange={(e) => updateHeader("document_date", e.target.value)}
                  onFocus={() => onSelectField("document_date")}
                  style={inputStyle(isActive(selectedField, "document_date", "po_date"), isFieldMissing("document_date", "po_date"))}
                />
              </FieldTile>

              <FieldTile
                label="Document Type"
                active={selectedField === "document_type"}
                onClick={() => onSelectField("document_type")}
                meta={fieldMeta("document_type")}
                missing={isFieldMissing("document_type")}
              >
                <input
                  value={headerState.document_type ?? messageFamily}
                  onChange={(e) => updateHeader("document_type", e.target.value)}
                  onFocus={() => onSelectField("document_type")}
                  style={inputStyle(selectedField === "document_type", isFieldMissing("document_type"))}
                />
              </FieldTile>

              <FieldTile
                label="Message Family"
                active={selectedField === "message_family"}
                onClick={() => onSelectField("message_family")}
                meta={fieldMeta("message_family")}
              >
                <input
                  value={messageFamily}
                  readOnly
                  onFocus={() => onSelectField("message_family")}
                  style={{
                    ...inputStyle(selectedField === "message_family"),
                    background: "#f8fafc",
                    color: "#475569",
                    cursor: "not-allowed",
                  }}
                />
              </FieldTile>
            </div>

            <div style={{ ...grid4, marginTop: 10 }}>
              <FieldTile
                label="Customer"
                active={selectedField === "customer_name"}
                onClick={() => onSelectField("customer_name")}
                meta={fieldMeta("customer_name")}
                missing={isFieldMissing("customer_name")}
              >
                <input
                  value={headerState.customer_name ?? ""}
                  onChange={(e) => updateHeader("customer_name", e.target.value)}
                  onFocus={() => onSelectField("customer_name")}
                  style={inputStyle(selectedField === "customer_name", isFieldMissing("customer_name"))}
                />
              </FieldTile>

              <FieldTile
                label="Supplier"
                active={selectedField === "supplier_name"}
                onClick={() => onSelectField("supplier_name")}
                meta={fieldMeta("supplier_name")}
                missing={isFieldMissing("supplier_name")}
              >
                <input
                  value={headerState.supplier_name ?? ""}
                  onChange={(e) => updateHeader("supplier_name", e.target.value)}
                  onFocus={() => onSelectField("supplier_name")}
                  style={inputStyle(selectedField === "supplier_name", isFieldMissing("supplier_name"))}
                />
              </FieldTile>

              <FieldTile
                label={taxIdLabel}
                active={selectedField === (isInvoiceDocument ? "tax_id" : "language_code")}
                onClick={() => onSelectField(isInvoiceDocument ? "tax_id" : "language_code")}
                meta={fieldMeta(isInvoiceDocument ? "tax_id" : "language_code")}
              >
                <input
                  value={isInvoiceDocument ? (headerState.tax_id ?? "") : (headerState.language_code ?? "")}
                  readOnly
                  onFocus={() => onSelectField(isInvoiceDocument ? "tax_id" : "language_code")}
                  style={{
                    ...inputStyle(selectedField === (isInvoiceDocument ? "tax_id" : "language_code")),
                    background: "#f8fafc",
                    color: "#475569",
                    cursor: "not-allowed",
                  }}
                />
              </FieldTile>

              <FieldTile
                label="Currency Code"
                active={selectedField === "currency_code"}
                onClick={() => onSelectField("currency_code")}
                meta={fieldMeta("currency_code")}
                missing={isFieldMissing("currency_code")}
              >
                <input
                  value={headerState.currency_code ?? ""}
                  onChange={(e) => updateHeader("currency_code", e.target.value)}
                  onFocus={() => onSelectField("currency_code")}
                  style={inputStyle(selectedField === "currency_code", isFieldMissing("currency_code"))}
                />
              </FieldTile>
            </div>
          </>
        )}

        <details style={{ marginTop: 10, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
          <summary
            style={{
              cursor: "pointer",
              listStyle: "none",
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 700,
              color: "#0f172a",
            }}
          >
            Raw Header Details
          </summary>
          <div style={{ padding: 10 }}>
            <FieldTile
              label="Header Details"
              active={selectedField === "header_details"}
              onClick={() => onSelectField("header_details")}
              meta={fieldMeta("header_details")}
              missing={isFieldMissing("header_details")}
            >
              <textarea
                value={headerState.header_details ?? ""}
                onChange={(e) => onSelectField("header_details") || updateHeader("header_details", e.target.value)}
                onFocus={() => onSelectField("header_details")}
                style={{ ...inputStyle(selectedField === "header_details"), minHeight: 64, fontFamily: "monospace" }}
              />
            </FieldTile>
          </div>
        </details>

        {isInvoiceDocument && (
          <div style={{ marginTop: 10 }}>
            <div style={grid2}>
              <FieldTile
                label="Invoice Total"
                active={selectedField === "invoice_total"}
                onClick={() => onSelectField("invoice_total")}
                meta={fieldMeta("invoice_total")}
                missing={isFieldMissing("invoice_total")}
              >
                <input
                  value={headerState.invoice_total ?? ""}
                  onChange={(e) => updateHeader("invoice_total", e.target.value)}
                  onFocus={() => onSelectField("invoice_total")}
                  style={inputStyle(selectedField === "invoice_total", isFieldMissing("invoice_total"))}
                />
              </FieldTile>

              <FieldTile
                label="Tax Total"
                active={selectedField === "tax_total"}
                onClick={() => onSelectField("tax_total")}
                meta={fieldMeta("tax_total")}
                missing={isFieldMissing("tax_total")}
              >
                <input
                  value={headerState.tax_total ?? ""}
                  onChange={(e) => updateHeader("tax_total", e.target.value)}
                  onFocus={() => onSelectField("tax_total")}
                  style={inputStyle(selectedField === "tax_total", isFieldMissing("tax_total"))}
                />
              </FieldTile>
            </div>
          </div>
        )}
      </SectionShell>
      <SectionShell title="Ship To">
        <div style={grid3}>
          <FieldTile
            label="Ship To ID"
            active={selectedField === "ship_to_code"}
            onClick={() => onSelectField("ship_to_code")}
            meta={fieldMeta("ship_to_code")}
            missing={isFieldMissing("ship_to_code")}
          >
            <input
              value={headerState.ship_to_code ?? ""}
              onChange={(e) => updateHeader("ship_to_code", e.target.value)}
              onFocus={() => onSelectField("ship_to_code")}
              style={inputStyle(selectedField === "ship_to_code", isFieldMissing("ship_to_code"))}
            />
          </FieldTile>

          <FieldTile
            label="Ship To Name"
            active={selectedField === "ship_to_name"}
            onClick={() => onSelectField("ship_to_name")}
            meta={fieldMeta("ship_to_name")}
            missing={isFieldMissing("ship_to_name")}
          >
            <input
              value={headerState.ship_to_name ?? ""}
              onChange={(e) => updateHeader("ship_to_name", e.target.value)}
              onFocus={() => onSelectField("ship_to_name")}
              style={inputStyle(selectedField === "ship_to_name", isFieldMissing("ship_to_name"))}
            />
          </FieldTile>

          <FieldTile
            label="Ship To Address"
            active={selectedField === "ship_to_address"}
            onClick={() => onSelectField("ship_to_address")}
            meta={fieldMeta("ship_to_address")}
            missing={isFieldMissing("ship_to_address")}
          >
            <input
              value={headerState.ship_to_address ?? ""}
              onChange={(e) => updateHeader("ship_to_address", e.target.value)}
              onFocus={() => onSelectField("ship_to_address")}
              style={inputStyle(selectedField === "ship_to_address", isFieldMissing("ship_to_address"))}
            />
          </FieldTile>
        </div>
      </SectionShell>

      <SectionShell title="Line Items">
        {canEditActions && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button type="button" onClick={addLineItem} style={secondaryActionBtn}>
              Add Line
            </button>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {itemsState.map((item, index) => {
            if (item?.is_deleted) return null;

            const displayLineNo =
              item?.line_no && Number(item.line_no) > 0 ? Number(item.line_no) : index + 1;

            const resolvedShipToCode =
              item.ship_to_override || item.ship_to_code || headerState.ship_to_code || "";

            return (
              <div key={index} style={lineSection}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={lineTitle}>Line {displayLineNo}</div>
                  {canEditActions && (
                    <button
                      type="button"
                      onClick={() => deleteLineItem(index)}
                      style={secondaryActionBtn}
                    >
                      Delete Line
                    </button>
                  )}
                </div>

                <SubSection title={lineSectionTitle}>
                  <div style={grid3}>
                    <FieldTile
                      label={isInvoiceDocument ? "Line Item" : "Line Number"}
                      active={selectedField === `items.${index}.line_no`}
                      onClick={() => onSelectField(`items.${index}.line_no`)}
                      meta={fieldMeta(`items.${index}.line_no`)}
                      missing={isFieldMissing(`items.${index}.line_no`)}
                    >
                      <input
                        value={item.line_no ?? ""}
                        onChange={(e) => updateItem(index, "line_no", e.target.value)}
                        onFocus={() => onSelectField(`items.${index}.line_no`)}
                        style={inputStyle(selectedField === `items.${index}.line_no`, isFieldMissing(`items.${index}.line_no`))}
                      />
                    </FieldTile>

                    <FieldTile
                      label={isInvoiceDocument ? "Allowance/Discount/Surcharge" : "Requested Delivery Date"}
                      active={selectedField === `items.${index}.delivery_date`}
                      onClick={() => onSelectField(`items.${index}.delivery_date`)}
                      meta={fieldMeta(`items.${index}.delivery_date`)}
                      missing={isFieldMissing(`items.${index}.delivery_date`)}
                    >
                      <input
                        value={isInvoiceDocument ? (item.allowance_discount_surcharge ?? item.delivery_date ?? "") : (item.delivery_date ?? "")}
                        onChange={(e) => updateItem(index, isInvoiceDocument ? "allowance_discount_surcharge" : "delivery_date", e.target.value)}
                        onFocus={() => onSelectField(`items.${index}.delivery_date`)}
                        style={inputStyle(selectedField === `items.${index}.delivery_date`, isFieldMissing(`items.${index}.delivery_date`))}
                      />
                    </FieldTile>

                    <FieldTile
                      label={isInvoiceDocument ? "Tax Amount" : "Requested Delivery Time"}
                      active={selectedField === `items.${index}.delivery_time`}
                      onClick={() => onSelectField(`items.${index}.delivery_time`)}
                      meta={fieldMeta(`items.${index}.delivery_time`)}
                      missing={isFieldMissing(`items.${index}.delivery_time`)}
                    >
                      <input
                        value={isInvoiceDocument ? (item.tax_amount ?? item.delivery_time ?? "") : (item.delivery_time ?? "")}
                        onChange={(e) => updateItem(index, isInvoiceDocument ? "tax_amount" : "delivery_time", e.target.value)}
                        onFocus={() => onSelectField(`items.${index}.delivery_time`)}
                        style={inputStyle(selectedField === `items.${index}.delivery_time`, isFieldMissing(`items.${index}.delivery_time`))}
                      />
                    </FieldTile>
                  </div>
                </SubSection>

                <SubSection title="Ship To Override">
                  <div style={grid2}>
                    <FieldTile
                      label="Line Ship To Override"
                      active={selectedField === `items.${index}.ship_to_override`}
                      onClick={() => onSelectField(`items.${index}.ship_to_override`)}
                      meta={fieldMeta(`items.${index}.ship_to_override`)}
                      missing={isFieldMissing(`items.${index}.ship_to_override`)}
                    >
                      <input
                        value={item.ship_to_override ?? ""}
                        onChange={(e) => updateItem(index, "ship_to_override", e.target.value)}
                        onFocus={() => onSelectField(`items.${index}.ship_to_override`)}
                        style={inputStyle(selectedField === `items.${index}.ship_to_override`, isFieldMissing(`items.${index}.ship_to_override`))}
                        placeholder="Leave blank to inherit from header"
                      />
                    </FieldTile>

                    <FieldTile label="Resolved Ship To" active={false} onClick={() => {}}>
                      <input
                        value={resolvedShipToCode}
                        readOnly
                        style={{
                          ...inputStyle(false),
                          background: "#f8fafc",
                          color: "#475569",
                        }}
                      />
                    </FieldTile>
                  </div>
                </SubSection>

                <SubSection title="Product Identification">
                  <div style={grid2}>
                    <FieldTile
                      label={isInvoiceDocument ? "Material" : "Document Product ID"}
                      active={selectedField === `items.${index}.material_code`}
                      onClick={() => onSelectField(`items.${index}.material_code`)}
                      meta={fieldMeta(`items.${index}.material_code`)}
                      missing={isFieldMissing(`items.${index}.material_code`)}
                    >
                      <input
                        value={item.material_code ?? ""}
                        onChange={(e) => updateItem(index, "material_code", e.target.value)}
                        onFocus={() => onSelectField(`items.${index}.material_code`)}
                        style={inputStyle(selectedField === `items.${index}.material_code`, isFieldMissing(`items.${index}.material_code`))}
                      />
                    </FieldTile>

                    <FieldTile
                      label="Mapped Product"
                      active={selectedField === `items.${index}.mapped_product`}
                      onClick={() => onSelectField(`items.${index}.mapped_product`)}
                      meta={fieldMeta(`items.${index}.mapped_product`)}
                      missing={isFieldMissing(`items.${index}.mapped_product`)}
                    >
                      <input
                        value={item.mapped_product ?? item.material_code ?? ""}
                        onChange={(e) => updateItem(index, "mapped_product", e.target.value)}
                        onFocus={() => onSelectField(`items.${index}.mapped_product`)}
                        style={inputStyle(selectedField === `items.${index}.mapped_product`, isFieldMissing(`items.${index}.mapped_product`))}
                      />
                    </FieldTile>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <FieldTile
                      label={isInvoiceDocument ? "Item Description / Details" : "Line Description / Details"}
                      active={
                        selectedField === `items.${index}.description` ||
                        selectedField === `items.${index}.line_details`
                      }
                      onClick={() => onSelectField(`items.${index}.description`)}
                      meta={fieldMeta(`items.${index}.description`)}
                      missing={isFieldMissing(`items.${index}.description`)}
                    >
                      <textarea
                        value={item.description ?? item.line_details ?? ""}
                        onChange={(e) => updateItem(index, "description", e.target.value)}
                        onFocus={() => onSelectField(`items.${index}.description`)}
                        style={{
                          ...inputStyle(
                            selectedField === `items.${index}.description` ||
                              selectedField === `items.${index}.line_details`
                          ),
                          minHeight: 60,
                        }}
                      />
                    </FieldTile>
                  </div>
                </SubSection>

                <SubSection title="Quantity & UOM">
                  <div style={grid2}>
                    <FieldTile
                      label={isInvoiceDocument ? "Quantity" : "Document Quantity"}
                      active={selectedField === `items.${index}.quantity`}
                      onClick={() => onSelectField(`items.${index}.quantity`)}
                      meta={fieldMeta(`items.${index}.quantity`)}
                      missing={isFieldMissing(`items.${index}.quantity`)}
                    >
                      <input
                        value={item.quantity ?? ""}
                        onChange={(e) => updateItem(index, "quantity", e.target.value)}
                        onFocus={() => onSelectField(`items.${index}.quantity`)}
                        style={inputStyle(selectedField === `items.${index}.quantity`, isFieldMissing(`items.${index}.quantity`))}
                      />
                    </FieldTile>

                    <FieldTile
                      label="Mapped Quantity"
                      active={selectedField === `items.${index}.mapped_quantity`}
                      onClick={() => onSelectField(`items.${index}.mapped_quantity`)}
                      meta={fieldMeta(`items.${index}.mapped_quantity`)}
                      missing={isFieldMissing(`items.${index}.mapped_quantity`)}
                    >
                      <input
                        value={item.mapped_quantity ?? item.quantity ?? ""}
                        onChange={(e) => updateItem(index, "mapped_quantity", e.target.value)}
                        onFocus={() => onSelectField(`items.${index}.mapped_quantity`)}
                        style={inputStyle(selectedField === `items.${index}.mapped_quantity`, isFieldMissing(`items.${index}.mapped_quantity`))}
                      />
                    </FieldTile>
                  </div>

                  <div style={{ ...grid2, marginTop: 10 }}>
                    <FieldTile
                      label={isInvoiceDocument ? "Quantity UOM" : "Document UOM"}
                      active={selectedField === `items.${index}.customer_uom`}
                      onClick={() => onSelectField(`items.${index}.customer_uom`)}
                      meta={fieldMeta(`items.${index}.customer_uom`)}
                      missing={isFieldMissing(`items.${index}.customer_uom`)}
                    >
                      <input
                        value={item.customer_uom ?? item.uom ?? ""}
                        onChange={(e) => updateItem(index, "uom", e.target.value)}
                        onFocus={() => onSelectField(`items.${index}.customer_uom`)}
                        style={inputStyle(selectedField === `items.${index}.customer_uom`, isFieldMissing(`items.${index}.customer_uom`))}
                      />
                    </FieldTile>

                    <FieldTile
                      label="UOM Conversion"
                      active={
                        selectedField ===
                        `items.${index}.supplier_uom_conversion_factor`
                      }
                      onClick={() =>
                        onSelectField(`items.${index}.supplier_uom_conversion_factor`)
                      }
                      meta={fieldMeta(`items.${index}.supplier_uom_conversion_factor`)}
                      missing={isFieldMissing(`items.${index}.supplier_uom_conversion_factor`)}
                    >
                      <input
                        value={item.supplier_uom_conversion_factor ?? ""}
                        onChange={(e) =>
                          updateItem(
                            index,
                            "supplier_uom_conversion_factor",
                            e.target.value
                          )
                        }
                        onFocus={() =>
                          onSelectField(`items.${index}.supplier_uom_conversion_factor`)
                        }
                        style={inputStyle(
                          selectedField ===
                            `items.${index}.supplier_uom_conversion_factor`
                        )}
                      />
                    </FieldTile>
                  </div>
                </SubSection>

                <SubSection title="Pricing">
                  <div style={grid2}>
                    <FieldTile
                      label={isInvoiceDocument ? "Price Per unit" : "Unit Price"}
                      active={selectedField === `items.${index}.unit_price`}
                      onClick={() => onSelectField(`items.${index}.unit_price`)}
                      meta={fieldMeta(`items.${index}.unit_price`)}
                      missing={isFieldMissing(`items.${index}.unit_price`)}
                    >
                      <input
                        value={isInvoiceDocument ? (item.unit_price ?? "") : (item.unit_price ?? "")}
                        onChange={(e) => updateItem(index, "unit_price", e.target.value)}
                        onFocus={() => onSelectField(`items.${index}.unit_price`)}
                        style={inputStyle(selectedField === `items.${index}.unit_price`, isFieldMissing(`items.${index}.unit_price`))}
                      />
                    </FieldTile>

                    <FieldTile
                      label={isInvoiceDocument ? "Line Item Total Amount" : "Amount"}
                      active={selectedField === `items.${index}.amount`}
                      onClick={() => onSelectField(`items.${index}.amount`)}
                      meta={fieldMeta(`items.${index}.amount`)}
                      missing={isFieldMissing(`items.${index}.amount`)}
                    >
                      <input
                        value={isInvoiceDocument ? (item.line_total_amount ?? item.amount ?? "") : (item.amount ?? "")}
                        onChange={(e) => updateItem(index, isInvoiceDocument ? "line_total_amount" : "amount", e.target.value)}
                        onFocus={() => onSelectField(`items.${index}.amount`)}
                        style={inputStyle(selectedField === `items.${index}.amount`, isFieldMissing(`items.${index}.amount`))}
                      />
                    </FieldTile>
                  </div>
                </SubSection>
              </div>
            );
          })}
        </div>

        {isInvoiceDocument && (
          <div style={{ marginTop: 12, border: "1px solid #e2e8f0", borderRadius: 12, background: "#f8fafc", padding: 12, fontSize: 13 }}>
            <strong>Total of all line items amount:</strong> {(
              (itemsState || []).reduce((sum: number, item: any) => {
                const raw = item?.line_total_amount ?? item?.amount ?? 0;
                const n = Number(String(raw).replace(/,/g, ""));
                return sum + (Number.isNaN(n) ? 0 : n);
              }, 0)
            ).toFixed(2)}
          </div>
        )}
      </SectionShell>

      {showArchiveModal && (
        <div style={modalOverlay} onClick={() => setShowArchiveModal(false)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
              Archive Document
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={modalLabel}>Archive Reason</label>
              <select
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                style={modalInput}
              >
                <option value="Not valid">Not valid</option>
                <option value="PO already manually entered">
                  PO already manually entered
                </option>
                <option value="PO requires changes at customer end">
                  PO requires changes at customer end
                </option>
                <option value="Duplicate document">Duplicate document</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={modalLabel}>Comment</label>
              <textarea
                value={archiveComment}
                onChange={(e) => setArchiveComment(e.target.value)}
                style={{ ...modalInput, minHeight: 90 }}
                placeholder="Optional comment"
              />
            </div>

            <div
              style={{
                marginTop: 16,
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={() => setShowArchiveModal(false)}
                style={secondaryActionBtn}
              >
                Cancel
              </button>
              <button type="button" onClick={submitArchive} style={primaryActionBtn}>
                Confirm Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {showIssueModal && (
        <div style={modalOverlay} onClick={() => setShowIssueModal(false)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
              Raise Issue
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={modalLabel}>Issue Type</label>
              <select
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                style={modalInput}
              >
                <option value="DATA_EXTRACTION">Data Extraction Issue</option>
                <option value="MAPPING">Mapping Issue</option>
                <option value="TEMPLATE_CHANGE">Customer Template Change</option>
                <option value="PROCESSING_FAILURE">Processing Failure</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={modalLabel}>Comments</label>
              <textarea
                value={issueComments}
                onChange={(e) => setIssueComments(e.target.value)}
                style={{ ...modalInput, minHeight: 100 }}
                placeholder="Describe the issue for support / IT helpdesk. Message details will be attached automatically"
              />
            </div>

            <div
              style={{
                marginTop: 16,
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={() => setShowIssueModal(false)}
                style={secondaryActionBtn}
              >
                Cancel
              </button>
              <button type="button" onClick={submitIssue} style={issueActionBtn}>
                Submit Issue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function isActive(selectedField: string | null, key: string, ...aliases: string[]) {
  return selectedField === key || aliases.includes(selectedField || "");
}

function TopMetaBar({ row }: { row: MonitoringRow }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#fff",
        padding: 14,
      }}
    >
      <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.7 }}>
        {!!(row.split_key || row.split_sequence) && (
          <div>
            <strong>Batch:</strong>{" "}
            {row.split_sequence ? `${row.split_sequence}` : "-"}
            {row.split_key ? ` • ${row.split_key}` : ""}
          </div>
        )}
        {!!row.parent_po_id && (
          <div>
            <strong>Parent PO:</strong>{" "}
            {row.parent_po_id}
          </div>
        )}
        <div>
          <strong>Creation Date:</strong> {(row as any).created_at || "-"}
        </div>
        <div>
          <strong>Document ID:</strong> {(row as any).docnum || row.po_id || "-"}
        </div>
        <div>
          <strong>Status:</strong> {row.status || "-"}
        </div>
        <div>
          <strong>Customer:</strong> {(row as any).sender || "-"}
        </div>
        <div>
          <strong>Supplier:</strong> {(row as any).receiver || (row as any).supplier_name || "-"}
        </div>
      </div>
    </div>
  );
}

function SectionShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #eef2f7",
          fontSize: 15,
          fontWeight: 700,
          color: "#0f172a",
          background: "#fcfdff",
        }}
      >
        {title}
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid #eef2f7",
        borderRadius: 10,
        background: "#fbfcfd",
        padding: 12,
        marginTop: 12,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#334155",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function FieldTile({
  label,
  active,
  onClick,
  children,
  meta,
  missing = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  meta?: any;
  missing?: boolean;
}) {
  const confidence = Number(meta?.confidence || 0);
  const confidenceColor =
    confidence >= 0.9 ? "#16a34a" : confidence >= 0.7 ? "#2563eb" : "#ea580c";

  return (
    <div
      onClick={onClick}
      style={{
        border: missing
          ? "1.5px solid #ef4444"
          : active
          ? "1.5px solid #0b5fff"
          : "1px solid #e5e7eb",
        background: missing ? "#fff5f5" : active ? "#eff6ff" : "#fff",
        borderRadius: 10,
        padding: 10,
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: missing ? "#b91c1c" : active ? "#1d4ed8" : "#64748b",
            marginBottom: 6,
          }}
        >
          {label}
        </div>

        {meta?.confidence ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: confidenceColor,
              whiteSpace: "nowrap",
            }}
          >
            {(confidence * 100).toFixed(0)}%
          </span>
        ) : null}
      </div>

      {children}

      {meta?.text ? (
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
          Extracted: {meta.text}
        </div>
      ) : null}

      {missing ? (
        <div style={{ fontSize: 10, color: "#b91c1c", marginTop: 2, fontWeight: 700 }}>
          Required field missing
        </div>
      ) : null}

      {meta?.source ? (
        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
          Source: {meta.source}
        </div>
      ) : null}
    </div>
  );
}

function IconButton({
  title,
  onClick,
  icon,
}: {
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        width: 34,
        height: 34,
        border: "1px solid #dbe4ee",
        borderRadius: 8,
        background: "#fff",
        color: "#334155",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      {icon}
    </button>
  );
}

function StatusBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 86,
        padding: "4px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        border: "1px solid #dbe4ee",
        background: "#eff6ff",
        color: "#1d4ed8",
      }}
    >
      {label}
    </span>
  );
}

function ConfidenceBadge({ label }: { label: string }) {
  const val = (label || "").toUpperCase();

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 78,
        padding: "4px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        border: "1px solid #dbe4ee",
        background:
          val === "HIGH" ? "#ecfdf5" : val === "MEDIUM" ? "#eff6ff" : "#fff7ed",
        color:
          val === "HIGH" ? "#166534" : val === "MEDIUM" ? "#1d4ed8" : "#c2410c",
      }}
    >
      {val || "N/A"}
    </span>
  );
}

function inputStyle(active: boolean, missing: boolean = false): React.CSSProperties {
  return {
    width: "100%",
    minHeight: 36,
    padding: "8px 10px",
    borderRadius: 8,
    border: missing ? "1px solid #fca5a5" : active ? "1px solid #93c5fd" : "1px solid #dbe4ee",
    background: "#fff",
    fontSize: 13,
    color: "#0f172a",
    outline: "none",
    boxSizing: "border-box",
  };
}

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const grid3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 10,
};

const grid4: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr 1fr",
  gap: 10,
};

const lineSection: React.CSSProperties = {
  border: "1px solid #eef2f7",
  borderRadius: 12,
  background: "#fff",
  padding: 12,
};

const lineTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#0f172a",
  marginBottom: 8,
};

const secondaryActionBtn: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const primaryActionBtn: React.CSSProperties = {
  border: "1px solid #0b5fff",
  background: "#0b5fff",
  color: "#fff",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const issueActionBtn: React.CSSProperties = {
  border: "1px solid #f59e0b",
  background: "#fff7ed",
  color: "#c2410c",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
};

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalCard: React.CSSProperties = {
  width: 520,
  maxWidth: "92vw",
  background: "#fff",
  borderRadius: 14,
  padding: 18,
  boxShadow: "0 20px 50px rgba(15,23,42,0.18)",
};

const modalLabel: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
  marginBottom: 6,
};

const modalInput: React.CSSProperties = {
  width: "100%",
  border: "1px solid #dbe4ee",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 13,
  boxSizing: "border-box",
};



