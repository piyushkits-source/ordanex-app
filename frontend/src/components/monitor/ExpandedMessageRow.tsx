import { useEffect, useMemo, useRef, useState } from "react";
import MessageViewerPanel from "./MessageViewerPanel";
import MessageDetailsPanel from "./MessageDetailsPanel";
import { getAuthHeaders } from "../utils/auth";
import type {
  MonitoringRow,
  ActivityLog,
  ProcessingStep,
  MappingField,
} from "../../types/monitoring";

type BBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  page?: number;
};

const API_BASE = "";

export default function ExpandedMessageRow({
  row,
  selectedField,
  onSelectField,
  activityLogs,
  processingFlow,
  onRefresh,
}: {
  row: MonitoringRow;
  selectedField: string | null;
  onSelectField: (fieldKey: string) => void;
  activityLogs: ActivityLog[];
  processingFlow: ProcessingStep[];
  onRefresh?: () => void | Promise<void>;
}) {
  const [bboxDraft, setBBoxDraft] = useState<Record<string, BBox>>({});
  const [valueDraft, setValueDraft] = useState<Record<string, string>>({});
  const [headerDraft, setHeaderDraft] = useState<Record<string, any>>({});
  const [itemsDraft, setItemsDraft] = useState<any[]>([]);
  const [uiMessage, setUiMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!uiMessage) return;

    const timer = setTimeout(() => {
      setUiMessage(null);
    }, 4000); // 4 seconds

    return () => clearTimeout(timer);
  }, [uiMessage]);

  const [dirtyHeaderFields, setDirtyHeaderFields] = useState<Record<string, boolean>>({});
  const [dirtyItemFields, setDirtyItemFields] = useState<Record<string, boolean>>({});
  const [dirtyMappings, setDirtyMappings] = useState<Record<string, boolean>>({});

  const bboxDraftRef = useRef<Record<string, BBox>>({});

  const normalizedStatus = (row.status ?? "").toString().trim().toUpperCase();
  const editable = ["PENDING", "ERROR", "NEW", "FAILED", "CORRECTED"].includes(
    normalizedStatus
  );

  const baseMappings = Array.isArray(row.mappings) ? row.mappings : [];

  useEffect(() => {
    const mappingMap: Record<string, any> = {};
    ((row as any).mappings || []).forEach((m: any) => {
      if (m?.key) mappingMap[m.key] = m;
    });

    const fallbackMappingValue = (key: string, fallback = "") => {
      const v = mappingMap[key]?.value;
      return v !== undefined && v !== null && String(v).trim() !== "" ? v : fallback;
    };

    setHeaderDraft({
      document_number:
        (row as any).po_number ??
        fallbackMappingValue("document_number", ""),
      document_date:
        (row as any).po_date ??
        fallbackMappingValue("document_date", ""),
      customer_name:
        (row as any).sender ??
        fallbackMappingValue("customer_name", ""),
      supplier_name:
        (row as any).receiver ??
        (row as any).supplier_name ??
        fallbackMappingValue("supplier_name", ""),
      document_type:
        (row as any).po_type ??
        fallbackMappingValue("document_type", ""),
      order_type:
        (row as any).order_type ??
        fallbackMappingValue("order_type", ""),
      language_code:
        (row as any).language_code ??
        fallbackMappingValue("language_code", ""),
      currency_code:
        (row as any).currency ??
        fallbackMappingValue("currency_code", ""),
      ship_to_code:
        (row as any).ship_to_partner?.code ??
        fallbackMappingValue("ship_to_code", ""),
      ship_to_name:
        (row as any).ship_to_partner?.name ??
        fallbackMappingValue("ship_to_name", ""),
      ship_to_address:
        (row as any).ship_to_partner?.address ??
        fallbackMappingValue("ship_to_address", ""),
      header_details:
        (row as any).header_details ??
        fallbackMappingValue("header_details", ""),
    });

    const sourceItems = [...(((row as any).items as any[]) || [])].sort((a, b) => {
      const aNo = Number(a?.line_no ?? 0);
      const bNo = Number(b?.line_no ?? 0);
      return aNo - bNo;
    });

    const normalizedItems = sourceItems.map((item, idx) => ({
      ...item,
      line_no:
        item?.line_no === undefined ||
        item?.line_no === null ||
        String(item.line_no).trim() === "" ||
        Number(item.line_no) <= 0
          ? idx + 1
          : Number(item.line_no),
    }));

    setItemsDraft(normalizedItems);
    setDirtyHeaderFields({});
    setDirtyItemFields({});
    setDirtyMappings({});
  }, [row.po_id, row]);

  const mergedMappings: MappingField[] = useMemo(() => {
    const merged: MappingField[] = [...baseMappings];

    for (const [key, bbox] of Object.entries(bboxDraft)) {
      const idx = merged.findIndex((m) => m?.key === key);
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], bbox };
      } else {
        merged.push({
          key,
          label: key,
          value: "",
          bbox,
        } as MappingField);
      }
    }

    for (const [key, value] of Object.entries(valueDraft)) {
      const idx = merged.findIndex((m) => m?.key === key);
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], value };
      } else {
        merged.push({
          key,
          label: key,
          value,
        } as MappingField);
      }
    }

    return merged;
  }, [baseMappings, bboxDraft, valueDraft]);

  function markHeaderDirty(field: string) {
    setDirtyHeaderFields((prev) => ({ ...prev, [field]: true }));
  }

  function markItemDirty(index: number, field: string) {
    setDirtyItemFields((prev) => ({ ...prev, [`${index}.${field}`]: true }));
  }

  function markMappingDirty(key: string) {
    setDirtyMappings((prev) => ({ ...prev, [key]: true }));
  }

  function getAuthHeaders() {
    const token = localStorage.getItem("token");
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async function parseError(res: Response): Promise<string> {
    try {
      const data = await res.json();
      
      if (typeof data === "string") return data;

      if (data?.detail) {
        if (typeof data.detail === "string") return data.detail;

        if (Array.isArray(data.detail)) {
          return data.detail
            .map((item: any) => {
              if (typeof item === "string") return item;
              const loc = Array.isArray(item?.loc) ? item.loc.join(" > ") : "";
              const msg = item?.msg || JSON.stringify(item);
              return loc ? `${loc}: ${msg}` : msg;
            })
            .join(" | ");
        }

        if (typeof data.detail === "object") {
          return JSON.stringify(data.detail);
        }
      }

      if (data?.message) {
        if (typeof data.message === "string") return data.message;
        return JSON.stringify(data.message);
      }

      return JSON.stringify(data);
    } catch {
      try {
        return await res.text();
      } catch {
        return `Request failed with status ${res.status}`;
      }
    }
  }

  function toNumberOrNull(v: any) {
    if (v === "" || v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }

  function normalizeBBox(bbox: any) {
    if (!bbox || typeof bbox !== "object" || Array.isArray(bbox)) {
      return null;
    }

    const x = Number(bbox.x);
    const y = Number(bbox.y);
    const width = Number(bbox.width);
    const height = Number(bbox.height);
    const page =
      bbox.page === undefined || bbox.page === null ? 1 : Number(bbox.page);

    if (
      Number.isNaN(x) ||
      Number.isNaN(y) ||
      Number.isNaN(width) ||
      Number.isNaN(height)
    ) {
      return null;
    }

    return {
      x,
      y,
      width,
      height,
      page: Number.isNaN(page) ? 1 : page,
    };
  }

  function nonEmptyStringOrUndefined(v: any) {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim();
    return s === "" ? undefined : s;
  }

  function nonEmptyDateOrUndefined(v: any) {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim();
    return s === "" ? undefined : s;
  }

  function buildUpdatePayload() {
    const payload: Record<string, any> = {};

    const mappingValueOverrides: Record<string, any> = {
      document_number: headerDraft.document_number,
      po_number: headerDraft.document_number,
      document_date: headerDraft.document_date,
      po_date: headerDraft.document_date,
      customer_name: headerDraft.customer_name,
      supplier_name: headerDraft.supplier_name,
      document_type: headerDraft.document_type,
      order_type: headerDraft.order_type,
      language_code: headerDraft.language_code,
      currency_code: headerDraft.currency_code,
      ship_to_code: headerDraft.ship_to_code,
      ship_to_name: headerDraft.ship_to_name,
      ship_to_address: headerDraft.ship_to_address,
      header_details: headerDraft.header_details,
    };

    (itemsDraft || []).forEach((item: any, index: number) => {
      mappingValueOverrides[`items.${index}.line_no`] = item.line_no;
      mappingValueOverrides[`items.${index}.delivery_date`] = item.delivery_date;
      mappingValueOverrides[`items.${index}.delivery_time`] = item.delivery_time;
      mappingValueOverrides[`items.${index}.ship_to_override`] = item.ship_to_override;
      mappingValueOverrides[`items.${index}.material_code`] = item.material_code;
      mappingValueOverrides[`items.${index}.mapped_product`] = item.mapped_product;
      mappingValueOverrides[`items.${index}.description`] = item.description;
      mappingValueOverrides[`items.${index}.line_details`] = item.line_details;
      mappingValueOverrides[`items.${index}.quantity`] = item.quantity;
      mappingValueOverrides[`items.${index}.mapped_quantity`] = item.mapped_quantity;
      mappingValueOverrides[`items.${index}.customer_uom`] = item.uom ?? item.customer_uom;
      mappingValueOverrides[`items.${index}.supplier_uom_conversion_factor`] =
        item.supplier_uom_conversion_factor;
      mappingValueOverrides[`items.${index}.unit_price`] = item.unit_price;
      mappingValueOverrides[`items.${index}.amount`] = item.amount;
    });

    const updatedMappings = mergedMappings
      .filter((m: any) => m?.key)
      .map((m: any) => {
        const override =
          mappingValueOverrides[m.key] !== undefined ? mappingValueOverrides[m.key] : m.value;

        return {
          key: String(m.key),
          value:
            override === undefined || override === null
              ? ""
              : typeof override === "string"
              ? override
              : String(override),
          text:
            m.text === undefined || m.text === null
              ? ""
              : typeof m.text === "string"
              ? m.text
              : String(m.text),
          bbox: normalizeBBox(m.bbox),
          source: m.source ?? null,
          confidence: m.confidence ?? null,
        };
      });

    if (updatedMappings.length > 0) {
      payload.mappings = updatedMappings;
    }

    const updatedItems = (itemsDraft || [])
      .map((item: any, index: number) => {
        const obj: Record<string, any> = {};

        if (dirtyItemFields[`${index}.line_no`]) obj.line_no = toNumberOrNull(item.line_no);
        if (dirtyItemFields[`${index}.material_code`]) obj.material_code = item.material_code ?? "";
        if (dirtyItemFields[`${index}.description`]) obj.description = item.description ?? "";
        if (dirtyItemFields[`${index}.quantity`]) obj.quantity = toNumberOrNull(item.quantity);
        if (dirtyItemFields[`${index}.uom`] || dirtyItemFields[`${index}.customer_uom`]) {
          obj.uom = item.uom ?? item.customer_uom ?? "";
        }
        if (dirtyItemFields[`${index}.unit_price`]) obj.unit_price = toNumberOrNull(item.unit_price);
        if (dirtyItemFields[`${index}.amount`]) obj.amount = toNumberOrNull(item.amount);
        if (dirtyItemFields[`${index}.delivery_date`]) {
          obj.delivery_date = nonEmptyDateOrUndefined(item.delivery_date) ?? null;
        }
        if (dirtyItemFields[`${index}.plant`]) obj.plant = item.plant ?? null;

        const hasAnyField = Object.keys(obj).length > 0;
        if (hasAnyField && obj.line_no === undefined) {
          obj.line_no = toNumberOrNull(item.line_no ?? index + 1);
        }

        if (hasAnyField) {
          obj.is_corrected = true;
          return obj;
        }

        return null;
      })
      .filter(Boolean);

    if (updatedItems.length > 0) {
      payload.items = updatedItems;
    }

    if (dirtyHeaderFields["document_number"]) {
      const v = nonEmptyStringOrUndefined(headerDraft.document_number);
      if (v !== undefined) payload.po_number = v;
    }

    if (dirtyHeaderFields["document_date"]) {
      payload.po_date = nonEmptyDateOrUndefined(headerDraft.document_date) ?? null;
    }

    if (dirtyHeaderFields["customer_name"]) {
      const v = nonEmptyStringOrUndefined(headerDraft.customer_name);
      if (v !== undefined) payload.sender = v;
    }

    if (dirtyHeaderFields["supplier_name"]) {
      const v = nonEmptyStringOrUndefined(headerDraft.supplier_name);
      if (v !== undefined) payload.receiver = v;
    }

    if (dirtyHeaderFields["document_type"]) {
      const v = nonEmptyStringOrUndefined(headerDraft.document_type);
      if (v !== undefined) payload.po_type = v;
    }

    if (dirtyHeaderFields["order_type"]) {
      const v = nonEmptyStringOrUndefined(headerDraft.order_type);
      if (v !== undefined) payload.order_type = v;
    }

    if (dirtyHeaderFields["currency_code"]) {
      const v = nonEmptyStringOrUndefined(headerDraft.currency_code);
      if (v !== undefined) payload.currency = v;
    }

    if (dirtyHeaderFields["ship_to_code"]) {
      const v = nonEmptyStringOrUndefined(headerDraft.ship_to_code);
      if (v !== undefined) payload.ship_to = v;
    }

    if (dirtyHeaderFields["ship_to_name"]) {
      const v = nonEmptyStringOrUndefined(headerDraft.ship_to_name);
      if (v !== undefined) payload.ship_to_name = v;
    }

    if (dirtyHeaderFields["ship_to_address"]) {
      const v = nonEmptyStringOrUndefined(headerDraft.ship_to_address);
      if (v !== undefined) payload.ship_to_address = v;
    }

    if (dirtyHeaderFields["header_details"]) {
      const v = nonEmptyStringOrUndefined(headerDraft.header_details);
      if (v !== undefined) payload.header_details = v;
    }

    return payload;
  }

  async function handleSave() {
    try {
      setUiMessage(null);

      const payload = buildUpdatePayload();

      if (Object.keys(payload).length === 0) {
        setUiMessage({ type: "success", text: "No changes to save." });
        return;
      }

      const res = await fetch(`${API_BASE}/purchase-orders/${row.po_id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await parseError(res);
        throw new Error(err || "Save failed");
      }

      await onRefresh?.();
      setUiMessage({
        type: "success",
        text: "Changes saved successfully.",
      });
    } catch (err: any) {
      setUiMessage({ type: "error", text: err?.message || "Save failed." });
    }
  }

  async function handleSaveAndReprocess() {
    try {
      setUiMessage(null);

      const payload = buildUpdatePayload();

      if (Object.keys(payload).length > 0) {
        const saveRes = await fetch(`${API_BASE}/purchase-orders/${row.po_id}`, {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });

        if (!saveRes.ok) {
          const err = await parseError(saveRes);
          throw new Error(err || "Save failed");
        }
      }

      const processRes = await fetch(`${API_BASE}/purchase-orders/${row.po_id}/reprocess`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      });

      if (!processRes.ok) {
        const err = await parseError(processRes);
        throw new Error(err || "Reprocess failed");
      }

      await onRefresh?.();
      setUiMessage({
        type: "success",
        text: "Saved and reprocessing triggered.",
      });
    } catch (err: any) {
      setUiMessage({
        type: "error",
        text: err?.message || "Save & Reprocess failed.",
      });
    }
  }

  async function handleArchive(reason: string, comment: string) {
    try {
      setUiMessage(null);

      const res = await fetch(`${API_BASE}/purchase-orders/${row.po_id}/archive`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason, comment }),
      });

      if (!res.ok) {
        const err = await parseError(res);
        throw new Error(err || "Archive failed");
      }

      await onRefresh?.();
      setUiMessage({ type: "success", text: "Document archived." });
    } catch (err: any) {
      console.error("ARCHIVE failed:", err);
      setUiMessage({ type: "error", text: err?.message || "Archive failed." });
    }
  }

  async function handleRaiseIssue(payload: {
    issueType: string;
    comments: string;
    row: MonitoringRow;
    mappings: MappingField[];
  }) {
    try {
      const issueBody = `
  Issue Type: ${payload.issueType}

  PO ID: ${row.po_id}
  PO Number: ${(row as any).po_number || "-"}
  Customer: ${(row as any).sender || "-"}
  Supplier: ${(row as any).receiver || (row as any).supplier_name || "-"}
  Status: ${(row as any).status || "-"}
  Environment: ${(row as any).environment || "-"}

  Header Values:
  - Document Number: ${headerDraft.document_number || ""}
  - Document Date: ${headerDraft.document_date || ""}
  - Document Type: ${headerDraft.document_type || ""}
  - Order Type: ${headerDraft.order_type || ""}
  - Currency: ${headerDraft.currency_code || ""}
  - Ship To Code: ${headerDraft.ship_to_code || ""}
  - Ship To Name: ${headerDraft.ship_to_name || ""}
  - Ship To Address: ${headerDraft.ship_to_address || ""}

  Line Items:
  ${(itemsDraft || [])
    .map(
      (item: any, idx: number) =>
        `Line ${idx + 1}: material=${item.material_code || ""}, qty=${item.quantity || ""}, uom=${item.uom || ""}, price=${item.unit_price || ""}, amount=${item.amount || ""}`
    )
    .join("\n")}

  User Comments:
  ${payload.comments || ""}
      `.trim();

      console.log("RAISE ISSUE payload =", issueBody);

      setUiMessage({
        type: "success",
        text: "Issue submitted to support / IT help.",
      });
    } catch (err: any) {
      console.error("RAISE ISSUE failed:", err);
      setUiMessage({
        type: "error",
        text: err?.message || "Issue submission failed.",
      });
    }
  }

  return (
    <div className="expanded-shell">
      <div className="expanded-top-strip">
        <div className="expanded-doc-meta">
          <span className="expanded-chip">
            Document: {(row as any).po_number || (row as any).docnum || "-"}
          </span>
          <span className="expanded-chip">Customer: {(row as any).sender || "-"}</span>
          <span className="expanded-chip">
            Supplier: {(row as any).receiver || (row as any).supplier_name || "-"}
          </span>
        </div>

        <div className="expanded-right-meta">
          <span className={`expanded-status ${statusClass(normalizedStatus)}`}>
            {renderStatusLabel(normalizedStatus)}
          </span>
          {!!(row as any).po_confidence && (
            <span
              className={`expanded-confidence ${confidenceClass(
                (row as any).po_confidence
              )}`}
            >
              {String((row as any).po_confidence).toUpperCase()}
            </span>
          )}
        </div>
      </div>

      <div className="expanded-grid">
        <div className="expanded-panel viewer-panel">
          <div className="expanded-panel-header">
            <div>
              <div className="expanded-panel-title">Original Document</div>
              <div className="expanded-panel-subtitle">
                Draw and adjust bounding boxes directly on the source file
              </div>
            </div>
          </div>

          <div className="expanded-panel-body">
            <MessageViewerPanel
              fileUrl={(row as any).file_url}
              fileName={(row as any).file_name}
              mimeType={(row as any).mime_type}
              rawText={(row as any).raw_text}
              mappings={mergedMappings}
              selectedField={selectedField}
              onSelectField={onSelectField}
              editable={editable}
              onBBoxChange={(fieldKey, bbox, value) => {
                const next = {
                  ...bboxDraftRef.current,
                  [fieldKey]: bbox,
                };

                bboxDraftRef.current = next;
                setBBoxDraft(next);
                markMappingDirty(fieldKey);

                if (value !== undefined) {
                  setValueDraft((prev) => ({
                    ...prev,
                    [fieldKey]: value,
                  }));
                  markMappingDirty(fieldKey);

                  if (!fieldKey.startsWith("items.")) {
                    setHeaderDraft((prev) => ({
                      ...prev,
                      [fieldKey]: value,
                    }));
                    markHeaderDirty(fieldKey);
                  } else {
                    const parts = fieldKey.split(".");
                    const idx = Number(parts[1]);
                    const field = parts[2];

                    if (!Number.isNaN(idx)) {
                      setItemsDraft((prev) => {
                        const nextItems = [...prev];
                        if (!nextItems[idx]) return prev;
                        nextItems[idx] = {
                          ...nextItems[idx],
                          [field]: value,
                        };
                        return nextItems;
                      });
                      markItemDirty(idx, field);
                    }
                  }
                }

                onSelectField(fieldKey);
              }}
            />
          </div>
        </div>

        <div className="expanded-panel details-panel">
          <div className="expanded-panel-header">
            <div>
              <div className="expanded-panel-title">Mapped Details</div>
              <div className="expanded-panel-subtitle">
                Review, correct, and enrich document fields before processing
              </div>
            </div>
          </div>

          <div className="expanded-panel-body details-scroll">
            <MessageDetailsPanel
              row={row}
              mappings={mergedMappings}
              selectedField={selectedField}
              onSelectField={onSelectField}
              activityLogs={activityLogs}
              processingFlow={processingFlow}
              onRefresh={onRefresh}
              onSave={handleSave}
              onSaveAndReprocess={handleSaveAndReprocess}
              onArchive={handleArchive}
              onRaiseIssue={handleRaiseIssue}
              headerState={headerDraft}
              onHeaderStateChange={setHeaderDraft}
              itemsState={itemsDraft}
              onItemsStateChange={setItemsDraft}
              uiMessage={uiMessage}
              onClearUiMessage={() => setUiMessage(null)}
              onHeaderFieldDirty={markHeaderDirty}
              onItemFieldDirty={markItemDirty}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function renderStatusLabel(status: string) {
  if (["NEW", "PENDING", "CORRECTED"].includes(status)) return "Pending";
  if (["ERROR", "FAILED"].includes(status)) return "Error";
  if (["PROCESSING", "REPROCESSING", "TRANSFORMED"].includes(status)) {
    return "In Progress";
  }
  if (["PROCESSED", "SUCCESS"].includes(status)) return "Processed";
  return status || "Unknown";
}

function statusClass(status: string) {
  if (["PROCESSED", "SUCCESS"].includes(status)) return "success";
  if (["ERROR", "FAILED"].includes(status)) return "error";
  if (["NEW", "PENDING", "CORRECTED"].includes(status)) return "pending";
  if (["PROCESSING", "REPROCESSING", "TRANSFORMED"].includes(status)) {
    return "progress";
  }
  return "neutral";
}

function confidenceClass(value?: string | null) {
  const v = (value || "").toUpperCase();
  if (v === "HIGH") return "high";
  if (v === "MEDIUM") return "medium";
  return "low";
}