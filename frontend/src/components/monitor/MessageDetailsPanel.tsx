import { useEffect, useMemo, useState } from "react";
import {
  FaDownload,
  FaHistory,
  FaProjectDiagram,
  FaPlus,
  FaMinus,
  FaTable,
  FaCode,
  FaFilePdf,
} from "react-icons/fa";
import { absoluteFileUrl } from "../../api/apiClient";
import type {
  ActivityLog,
  MappingField,
  MonitoringRow,
  ProcessingStep,
  RightPanelTab,
} from "../../types/monitoring";

type LineItem = {
  id?: string | number;
  line_no?: number | string;
  material_code?: string;
  description?: string;
  quantity?: number | string;
  uom?: string;
  unit_price?: number | string;
  amount?: number | string;
  delivery_date?: string;
  delivery_time?: string;
  ship_to_override?: string;
  mapped_product?: string;
  mapped_quantity?: number | string;
  supplier_uom_conversion_factor?: string | number;
};

type Props = {
  row: MonitoringRow & {
    mappings?: MappingField[];
    items?: LineItem[];
    xml_payload?: string;
    po_number?: string;
    file_url?: string;
    sender?: string;
    receiver?: string;
    supplier_name?: string;
    currency?: string;
    po_date?: string;
  };
  selectedField: string | null;
  onSelectField: (fieldKey: string) => void;
  activityLogs: ActivityLog[];
  processingFlow: ProcessingStep[];

  onSave?: () => void | Promise<void>;
  onSaveAndReprocess?: () => void | Promise<void>;
  onArchive?: (reason?: string, comment?: string) => void | Promise<void>;

  itemsState?: LineItem[];
  onItemsStateChange?: React.Dispatch<React.SetStateAction<LineItem[]>>;
};

const primaryButton: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#0b5fff",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  border: "1px solid #d3deea",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#ffffff",
  color: "#0f172a",
  fontWeight: 700,
  cursor: "pointer",
};

const miniActionBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  border: "1px solid #dbe4ee",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 6,
  fontWeight: 800,
  cursor: "pointer",
};

const miniDangerBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
  borderRadius: 6,
  fontWeight: 800,
  cursor: "pointer",
};

const miniToggleButton: React.CSSProperties = {
  width: 24,
  height: 24,
  border: "1px solid #d3deea",
  borderRadius: 6,
  background: "#ffffff",
  color: "#0f172a",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};

const summaryChip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  border: "1px solid #dbe4ee",
  background: "#f8fafc",
  color: "#475569",
};



export default function MessageDetailsPanel({
  row,
  selectedField,
  onSelectField,
  activityLogs,
  processingFlow,
  onSave,
  onSaveAndReprocess,
  onArchive,
  itemsState,
  onItemsStateChange,
}: Props) {
  const editable = ["PENDING", "ERROR", "FAILED", "CORRECTED", "NEW"].includes(
    (row.status || "").toUpperCase()
  );
  const canEditActions = editable;

  const mappings = useMemo(() => {
    if (row.mappings && row.mappings.length > 0) {
      return row.mappings;
    }
    return deriveMappings(row);
  }, [row]);

  const [activeTab, setActiveTab] = useState<RightPanelTab>("FIELDS");
  const [expandedLines, setExpandedLines] = useState<number[]>([]);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveReason, setArchiveReason] = useState("Not valid");
  const [archiveComment, setArchiveComment] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [localItems, setLocalItems] = useState<LineItem[]>(row.items || []);

  useEffect(() => {
    setLocalItems(row.items || []);
  }, [row]);

  const currentItems = itemsState ?? localItems;
  const setItems = onItemsStateChange ?? setLocalItems;

  const originalUrl = absoluteFileUrl(row.file_url);
  const transformedUrl = row.xml_payload
    ? `data:text/xml;charset=utf-8,${encodeURIComponent(row.xml_payload)}`
    : "";

  function toggleLine(index: number) {
    setExpandedLines((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index]
    );
  }

  async function runAction(
    key: string,
    fn?: () => void | Promise<void>
  ) {
    if (!fn) return;
    try {
      setBusyAction(key);
      await fn();
    } catch (err) {
      console.error(`${key} failed`, err);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDownloadCanonical() {
    try {
      const res = await fetch(
        `/purchase-orders/${row.po_id}/download/canonical`
      );
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const contentType = res.headers.get("content-type") || "";
      let blob: Blob;
      if (contentType.includes("application/json")) {
        const data = await res.json();
        blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json;charset=utf-8",
        });
      } else {
        const text = await res.text();
        blob = new Blob([text], {
          type: "application/json;charset=utf-8",
        });
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${row.po_number || row.po_id || "document"}_canonical.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Canonical download failed", err);
    }
  }

  function addLine() {
    const nextLineNo =
      currentItems.length > 0
        ? Math.max(...currentItems.map((x) => Number(x?.line_no || 0))) + 1
        : 1;

    setItems((prev) => [
      ...prev,
      {
        line_no: nextLineNo,
        material_code: "",
        description: "",
        quantity: "",
        uom: "",
        unit_price: "",
        amount: "",
        delivery_date: "",
        delivery_time: "",
        ship_to_override: "",
        mapped_product: "",
        mapped_quantity: "",
        supplier_uom_conversion_factor: "",
      },
    ]);
    setExpandedLines((prev) => [...prev, currentItems.length]);
  }

  function insertLineBelow(index: number) {
    const copy = [...currentItems];
    copy.splice(index + 1, 0, {
      line_no: index + 2,
      material_code: "",
      description: "",
      quantity: "",
      uom: "",
      unit_price: "",
      amount: "",
      delivery_date: "",
      delivery_time: "",
      ship_to_override: "",
      mapped_product: "",
      mapped_quantity: "",
      supplier_uom_conversion_factor: "",
    });

    const normalized = copy.map((item, i) => ({
      ...item,
      line_no: i + 1,
    }));

    setItems(normalized);
    setExpandedLines((prev) => [...prev, index + 1]);
  }

  function deleteLine(index: number) {
    const copy = currentItems
      .filter((_, i) => i !== index)
      .map((item, i) => ({
        ...item,
        line_no: i + 1,
      }));

    setItems(copy);
    setExpandedLines((prev) =>
      prev.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i))
    );
  }

  function updateItem(index: number, key: keyof LineItem, value: string) {
    const copy = [...currentItems];
    copy[index] = { ...copy[index], [key]: value };
    setItems(copy);
  }

  async function submitArchive() {
    await runAction("archive", async () => {
      await onArchive?.(archiveReason, archiveComment);
      setShowArchiveModal(false);
      setArchiveComment("");
      setArchiveReason("Not valid");
    });
  }

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #dbe4ee",
        borderRadius: 12,
        padding: 14,
        display: "grid",
        gap: 14,
        minHeight: 700,
        alignContent: "start",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16, color: "#0f172a" }}>
          {activeTab === "FIELDS"
            ? "Extracted Fields"
            : activeTab === "ACTIVITY_LOGS"
            ? "Activity Logs"
            : "Processing Status"}
        </div>

        {canEditActions && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              flexWrap: "wrap",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowArchiveModal(true);
              }}
              style={secondaryButton}
              disabled={busyAction !== null}
            >
              Archive & Ignore
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void runAction("save", onSave);
              }}
              style={secondaryButton}
              disabled={busyAction !== null}
            >
              {busyAction === "save" ? "Saving..." : "Save"}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void runAction("reprocess", onSaveAndReprocess);
              }}
              style={primaryButton}
              disabled={busyAction !== null}
            >
              {busyAction === "reprocess" ? "Re-Processing..." : "Save & Re-Process"}
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <IconButton
          active={activeTab === "FIELDS"}
          title="Field Selection"
          onClick={() => setActiveTab("FIELDS")}
          icon={<FaTable />}
        />

        <a
          href={originalUrl || "#"}
          target="_blank"
          rel="noreferrer"
          style={{
            ...iconButtonStyle(false),
            textDecoration: "none",
            color: "#0f172a",
            pointerEvents: originalUrl ? "auto" : "none",
            opacity: originalUrl ? 1 : 0.5,
          }}
          title="Download Original Document"
        >
          <FaFilePdf />
        </a>

        <button
          type="button"
          onClick={() => void handleDownloadCanonical()}
          style={iconButtonStyle(false)}
          title="Download Canonical JSON"
        >
          <FaCode />
        </button>

        <a
          href={transformedUrl || "#"}
          download={`${row.po_number || row.po_id}.xml`}
          style={{
            ...iconButtonStyle(false),
            textDecoration: "none",
            color: "#0f172a",
            opacity: transformedUrl ? 1 : 0.5,
            pointerEvents: transformedUrl ? "auto" : "none",
          }}
          title="Download Transformed XML"
        >
          <FaDownload />
        </a>

        <IconButton
          active={activeTab === "ACTIVITY_LOGS"}
          title="Activity Logs"
          onClick={() => setActiveTab("ACTIVITY_LOGS")}
          icon={<FaHistory />}
        />

        <IconButton
          active={activeTab === "PROCESSING_FLOW"}
          title="Processing Status"
          onClick={() => setActiveTab("PROCESSING_FLOW")}
          icon={<FaProjectDiagram />}
        />
      </div>

      {activeTab === "FIELDS" && (
        <>
          <div style={{ display: "grid", gap: 10 }}>
            {mappings.length === 0 ? (
              <div style={emptyStateStyle}>No fields extracted yet</div>
            ) : (
              mappings.map((field) => (
                <button
                  key={field.key}
                  type="button"
                  onClick={() => onSelectField(field.key)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: `1px solid ${
                      selectedField === field.key ? "#0b5fff" : "#dbe4ee"
                    }`,
                    background:
                      selectedField === field.key ? "#eef4ff" : "#fff",
                    borderRadius: 10,
                    padding: 12,
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: "#64748b",
                      fontWeight: 700,
                    }}
                  >
                    {field.label}
                  </div>

                  <div
                    style={{
                      marginTop: 4,
                      color: "#0f172a",
                      fontWeight: 800,
                    }}
                  >
                    {String(field.value ?? "-")}
                  </div>
                </button>
              ))
            )}
          </div>

          <div style={{ borderTop: "1px solid #dbe4ee", paddingTop: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 800, color: "#0f172a" }}>
                Line Items
              </div>

              {canEditActions ? (
                <button type="button" style={secondaryButton} onClick={addLine}>
                  + Add Line
                </button>
              ) : null}

              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>
                {editable ? "Expand / collapse available" : "Read only"}
              </div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {currentItems.length === 0 ? (
                <div style={emptyStateStyle}>No line items available</div>
              ) : (
                currentItems.map((item, index) => {
                  const isOpen = !editable || expandedLines.includes(index);

                  return (
                    <div
                      key={item.id || String(index)}
                      style={{
                        borderBottom: "1px solid #e8eef5",
                        paddingBottom: 10,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          padding: "6px 0 8px 0",
                          flexWrap: "wrap",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          {editable ? (
                            <button
                              type="button"
                              onClick={() => toggleLine(index)}
                              style={miniToggleButton}
                              title={isOpen ? "Collapse line" : "Expand line"}
                            >
                              {isOpen ? <FaMinus size={10} /> : <FaPlus size={10} />}
                            </button>
                          ) : null}

                          <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 13 }}>
                            Line {index + 1}
                          </div>

                          <span style={summaryChip}>
                            Material: {item.material_code || "-"}
                          </span>
                          <span style={summaryChip}>
                            Qty: {String(item.quantity ?? "-")}
                          </span>
                          <span style={summaryChip}>
                            UOM: {item.uom || "-"}
                          </span>
                          <span style={summaryChip}>
                            Price: {String(item.unit_price ?? "-")}
                          </span>
                        </div>

                        {canEditActions ? (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => insertLineBelow(index)}
                              style={miniActionBtn}
                              title="Insert line below"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteLine(index)}
                              style={miniDangerBtn}
                              title="Delete line"
                            >
                              -
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {isOpen ? (
                        <div style={{ display: "grid", gap: 8 }}>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1.5fr 0.7fr 0.6fr 0.7fr",
                              gap: 8,
                            }}
                          >
                            <input
                              value={item.material_code || ""}
                              disabled={!editable}
                              style={fieldInput(editable)}
                              onFocus={() => onSelectField(`items.${index}.material_code`)}
                              onChange={(e) =>
                                updateItem(index, "material_code", e.target.value)
                              }
                            />
                            <input
                              value={item.description || ""}
                              disabled={!editable}
                              style={fieldInput(editable)}
                              onFocus={() => onSelectField(`items.${index}.description`)}
                              onChange={(e) =>
                                updateItem(index, "description", e.target.value)
                              }
                            />
                            <input
                              value={String(item.quantity ?? "")}
                              disabled={!editable}
                              style={fieldInput(editable)}
                              onFocus={() => onSelectField(`items.${index}.quantity`)}
                              onChange={(e) =>
                                updateItem(index, "quantity", e.target.value)
                              }
                            />
                            <input
                              value={item.uom || ""}
                              disabled={!editable}
                              style={fieldInput(editable)}
                              onFocus={() => onSelectField(`items.${index}.uom`)}
                              onChange={(e) =>
                                updateItem(index, "uom", e.target.value)
                              }
                            />
                            <input
                              value={String(item.unit_price ?? "")}
                              disabled={!editable}
                              style={fieldInput(editable)}
                              onFocus={() => onSelectField(`items.${index}.unit_price`)}
                              onChange={(e) =>
                                updateItem(index, "unit_price", e.target.value)
                              }
                            />
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr 1fr",
                              gap: 8,
                            }}
                          >
                            <input
                              value={item.delivery_date || ""}
                              disabled={!editable}
                              style={fieldInput(editable)}
                              placeholder="Delivery Date"
                              onFocus={() => onSelectField(`items.${index}.delivery_date`)}
                              onChange={(e) =>
                                updateItem(index, "delivery_date", e.target.value)
                              }
                            />
                            <input
                              value={item.delivery_time || ""}
                              disabled={!editable}
                              style={fieldInput(editable)}
                              placeholder="Delivery Time"
                              onFocus={() => onSelectField(`items.${index}.delivery_time`)}
                              onChange={(e) =>
                                updateItem(index, "delivery_time", e.target.value)
                              }
                            />
                            <input
                              value={String(item.amount ?? "")}
                              disabled={!editable}
                              style={fieldInput(editable)}
                              placeholder="Amount"
                              onFocus={() => onSelectField(`items.${index}.amount`)}
                              onChange={(e) =>
                                updateItem(index, "amount", e.target.value)
                              }
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === "ACTIVITY_LOGS" && (
        <div style={{ display: "grid", gap: 8, maxHeight: 560, overflow: "auto" }}>
          {activityLogs.length === 0 ? (
            <div style={emptyStateStyle}>No activity logs found</div>
          ) : (
            activityLogs.map((log, index) => {
              const actor =
                (log as any).user_email ||
                (log as any).actor_email ||
                (log as any).user ||
                (log as any).system_id ||
                (log as any).actor ||
                "AUTO_SUBMISSION";

              return (
                <div key={index} style={timelineCard}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>
                    {(log as any).stage || (log as any).level || "Activity"}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "#475569" }}>
                    {(log as any).message || "-"}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: "#334155", fontWeight: 700 }}>
                    {actor}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: "#94a3b8" }}>
                    {(log as any).timestamp || (log as any).created_at || ""}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === "PROCESSING_FLOW" && (
        <div style={{ display: "grid", gap: 8, maxHeight: 560, overflow: "auto" }}>
          {processingFlow.length === 0 ? (
            <div style={emptyStateStyle}>No processing steps available</div>
          ) : (
            processingFlow.map((step, index) => (
              <div key={index} style={timelineCard}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>
                    {(step as any).name ||
                      (step as any).step_name ||
                      (step as any).stage ||
                      `Step ${index + 1}`}
                  </div>
                  <FlowStatusPill value={(step as any).status || ""} />
                </div>

                {(step as any).details ? (
                  <div style={{ marginTop: 6, fontSize: 13, color: "#475569" }}>
                    {(step as any).details}
                  </div>
                ) : null}

                <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>
                  {(step as any).timestamp || (step as any).created_at || ""}
                </div>
              </div>
            ))
          )}
        </div>
      )}

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
                style={secondaryButton}
              >
                Cancel
              </button>
              <button type="button" onClick={() => void submitArchive()} style={primaryButton}>
                Confirm Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FlowStatusPill({ value }: { value: string }) {
  const normalized = (value || "").toUpperCase();
  const styles =
    normalized === "SUCCESS" || normalized === "COMPLETED"
      ? { background: "#ecfdf5", color: "#166534", border: "#bbf7d0" }
      : normalized === "FAILED" || normalized === "ERROR"
      ? { background: "#fef2f2", color: "#b91c1c", border: "#fecaca" }
      : { background: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        border: `1px solid ${styles.border}`,
        background: styles.background,
        color: styles.color,
      }}
    >
      {normalized || "N/A"}
    </span>
  );
}

function IconButton({
  title,
  onClick,
  icon,
  active = false,
}: {
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={iconButtonStyle(active)}
    >
      {icon}
    </button>
  );
}

function iconButtonStyle(active: boolean): React.CSSProperties {
  return {
    width: 34,
    height: 34,
    border: active ? "1px solid #3b82f6" : "1px solid #d3deea",
    borderRadius: 8,
    background: active ? "#eef4ff" : "#ffffff",
    color: active ? "#0b5fff" : "#0f172a",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  };
}

function fieldInput(editable: boolean): React.CSSProperties {
  return {
    width: "100%",
    border: "1px solid #dbe4ee",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
    background: editable ? "#ffffff" : "#f8fafc",
    color: "#0f172a",
    outline: "none",
    minHeight: 36,
    boxSizing: "border-box",
  };
}

function deriveMappings(row: MonitoringRow & {
  po_number?: string;
  po_date?: string;
  sender?: string;
  receiver?: string;
  supplier_name?: string;
  currency?: string;
}): MappingField[] {
  const base: MappingField[] = [];

  if (row.po_number) {
    base.push({ key: "po_number", label: "PO Number", value: row.po_number });
  }
  if ((row as any).po_date) {
    base.push({
      key: "po_date",
      label: "PO Date",
      value: String((row as any).po_date),
    });
  }
  if ((row as any).sender) {
    base.push({ key: "sender", label: "Customer", value: (row as any).sender });
  }
  if ((row as any).receiver || (row as any).supplier_name) {
    base.push({
      key: "receiver",
      label: "Supplier",
      value: (row as any).receiver || (row as any).supplier_name,
    });
  }
  if ((row as any).currency) {
    base.push({
      key: "currency",
      label: "Currency",
      value: String((row as any).currency),
    });
  }

  return base;
}

const emptyStateStyle: React.CSSProperties = {
  padding: 20,
  textAlign: "center",
  color: "#64748b",
  border: "1px dashed #dbe4ee",
  borderRadius: 10,
};

const timelineCard: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #eef2f7",
  borderRadius: 10,
  background: "#fafbfc",
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