import { useEffect, useMemo, useRef, useState } from "react";
import MessageViewerPanel from "./MessageViewerPanel";
import MessageDetailsPanel from "./MessageDetailsPanel";
import { absoluteFileUrl } from "../../api/apiClient";
import { apiFetch, parseApiError } from "../../utils/api";
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

    const headerDetailsRaw = (row as any).header_details;
    const invoiceFieldsRaw = (row as any).invoice_fields;
    const structuredTextRaw =
      (row as any).raw_text ||
      (row as any).xml_payload ||
      (row as any).transformedXml ||
      "";
    const fileUrlRaw = absoluteFileUrl((row as any).file_url || "");
    let headerDetailsSource: Record<string, any> = {};
    let invoiceFieldsSource: Record<string, any> = {};
    let structuredSource: Record<string, any> = {};

    const extractTagValue = (doc: Document, names: string[]) => {
      for (const name of names) {
        const nodes = Array.from(doc.getElementsByTagName(name));
        for (const node of nodes) {
          const value = (node.textContent || "").trim();
          if (value) return value;
        }
      }
      return "";
    };

    const extractFromNode = (node: Element, names: string[]) => {
      for (const name of names) {
        const matches = Array.from(node.getElementsByTagName(name));
        for (const match of matches) {
          const value = (match.textContent || "").trim();
          if (value) return value;
        }
      }
      return "";
    };

    const parseStructuredInvoice = (payload: string) => {
      if (!payload || !payload.trim().startsWith("<")) return {};

      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(payload, "application/xml");
        if (xmlDoc.querySelector("parsererror")) return {};

        const invoiceNumber =
          extractTagValue(xmlDoc, ["INVOICENO", "INVOICE_NO", "INVOICE", "BELNR", "DOCNUM", "XBLNR", "VBELN"]) || "";
        const invoiceDate =
          extractTagValue(xmlDoc, ["FKDAT", "BUDAT", "BLDAT", "INV_DATE", "INVOICE_DATE", "DOC_DATE", "ERDAT", "AUDAT", "DATUM"]) || "";
        const referencePo =
          extractTagValue(xmlDoc, ["BSTNK", "PO_NUMBER", "PO_NUM", "REFERENCE_PO", "XBLNR", "REF_DOC", "EBELN"]) || "";
        const supplierName =
          extractTagValue(xmlDoc, ["LIFNR_NAME", "VENDOR_NAME", "SUPPLIER_NAME", "NAME1", "SENDER_NAME", "LIFNR"]) || "";
        const customerName =
          extractTagValue(xmlDoc, ["KUNNR_NAME", "CUSTOMER_NAME", "BILL_TO_NAME", "NAME1", "RECEIVER_NAME", "KUNNR"]) || "";
        const taxId =
          extractTagValue(xmlDoc, ["STCD1", "VAT_NUMBER", "TAX_ID", "TAXID", "TAX_NUMBER", "STCEG", "VATREGNO"]) || "";
        const currencyCode =
          extractTagValue(xmlDoc, ["WAERS", "CURCY", "CURRENCY_CODE"]) || "";
        const invoiceTotal =
          extractTagValue(xmlDoc, ["WRBTR", "NETWR", "AMOUNT", "TOTAL_AMOUNT", "INVOICE_TOTAL", "GROSS_AMOUNT", "BRTWR", "WAVWR"]) || "";
        const taxTotal =
          extractTagValue(xmlDoc, ["MWSBP", "MWSBT", "TAX_AMOUNT", "VAT_AMOUNT", "TAX_TOTAL"]) || "";

        const items = Array.from(xmlDoc.getElementsByTagName("E1EDP01")).map((segment, index) => {
          const lineNo = extractFromNode(segment, ["POSEX", "LINE_NO"]) || String(index + 1);
          const material = extractFromNode(segment, ["MATNR", "MATERIAL", "PRODUCT", "MATNR_LONG"]) || "";
          const description =
            extractFromNode(segment, ["ARKTX", "TXZ01", "MAKTX", "DESCRIPTION", "SHORT_TEXT"]) || "";
          const quantity = extractFromNode(segment, ["MENGE", "QTY", "QUANTITY"]) || "";
          const uom = extractFromNode(segment, ["MENEE", "MEINS", "UOM", "BMEIN"]) || "";
          const unitPrice =
            extractFromNode(segment, ["PREIS", "NETPR", "KBETR", "UNIT_PRICE", "PRICE"]) || "";
          const amount =
            extractFromNode(segment, ["NETWR", "WRBTR", "AMOUNT", "LINE_AMOUNT"]) || "";
          const taxAmount =
            extractFromNode(segment, ["MWSBT", "MWSBP", "TAX_AMOUNT", "VAT_AMOUNT"]) || "";
          const lineTotalAmount =
            extractFromNode(segment, ["NETWR", "WRBTR", "LINE_TOTAL", "TOTAL_AMOUNT"]) || amount;

          return {
            line_no: Number(lineNo) || index + 1,
            material_code: material,
            description,
            quantity,
            uom,
            customer_uom: uom,
            unit_price: unitPrice,
            amount,
            tax_amount: taxAmount,
            line_total_amount: lineTotalAmount,
          };
        }).filter((item) =>
          Object.values(item).some((value) => value !== undefined && value !== null && String(value).trim() !== "")
        );

        return {
          document_number: invoiceNumber,
          invoice_number: invoiceNumber,
          billing_document_number: invoiceNumber,
          document_date: invoiceDate,
          invoice_date: invoiceDate,
          billing_date: invoiceDate,
          reference_po_number: referencePo,
          order_type: referencePo,
          supplier_name: supplierName,
          vendor_name: supplierName,
          customer_name: customerName,
          bill_to_name: customerName,
          tax_id: taxId,
          currency_code: currencyCode,
          invoice_total: invoiceTotal,
          tax_total: taxTotal,
          items,
        };
      } catch {
        return {};
      }
    };

    structuredSource = parseStructuredInvoice(structuredTextRaw);

    if (headerDetailsRaw && typeof headerDetailsRaw === "object" && !Array.isArray(headerDetailsRaw)) {
      headerDetailsSource = headerDetailsRaw;
    } else if (typeof headerDetailsRaw === "string") {
      const trimmed = headerDetailsRaw.trim();
      if (trimmed) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            headerDetailsSource = parsed;
          }
        } catch {
          headerDetailsSource = {};
        }
      }
    }

    if (invoiceFieldsRaw && typeof invoiceFieldsRaw === "object" && !Array.isArray(invoiceFieldsRaw)) {
      invoiceFieldsSource = invoiceFieldsRaw;
    }

    if (!Object.keys(structuredSource).length && typeof fileUrlRaw === "string" && fileUrlRaw.trim()) {
      void fetch(fileUrlRaw)
        .then((res) => (res.ok ? res.text() : ""))
        .then((payload) => {
          const hydrated = parseStructuredInvoice(payload || "");
          if (Object.keys(hydrated).length) {
            setHeaderDraft((prev) => ({
              ...prev,
              document_number: prev.document_number || hydrated.document_number || "",
              billing_document_number: prev.billing_document_number || hydrated.billing_document_number || "",
              document_date: prev.document_date || hydrated.document_date || "",
              billing_date: prev.billing_date || hydrated.billing_date || "",
              customer_name: prev.customer_name || hydrated.customer_name || "",
              supplier_name: prev.supplier_name || hydrated.supplier_name || "",
              tax_id: prev.tax_id || hydrated.tax_id || "",
              reference_po_number: prev.reference_po_number || hydrated.reference_po_number || "",
              invoice_total: prev.invoice_total || hydrated.invoice_total || "",
              tax_total: prev.tax_total || hydrated.tax_total || "",
              currency_code: prev.currency_code || hydrated.currency_code || "",
            }));
            if (Array.isArray((hydrated as any).items) && (hydrated as any).items.length > 0) {
              setItemsDraft((prev) => {
                const hasVisibleItems = prev.some((item: any) =>
                  Object.values(item || {}).some((value) => value !== undefined && value !== null && String(value).trim() !== "")
                );
                return hasVisibleItems ? prev : (hydrated as any).items;
              });
            }
          }
        })
        .catch(() => {});
    }

    const mergedHeaderSource = {
      ...headerDetailsSource,
      ...invoiceFieldsSource,
      ...structuredSource,
    };

    const headerDetailsText = Object.keys(mergedHeaderSource).length
      ? JSON.stringify(mergedHeaderSource, null, 2)
      : typeof headerDetailsRaw === "string"
        ? headerDetailsRaw.trim()
        : "";

    const fallbackHeaderValue = (...keys: string[]) => {
      for (const key of keys) {
        const value = mergedHeaderSource[key] ?? structuredSource[key];
        if (value !== undefined && value !== null && String(value).trim() !== "") {
          return value;
        }
      }
      return undefined;
    };

    setHeaderDraft({
      document_number:
        (row as any).invoice_number ??
        (row as any).billing_document_number ??
        fallbackHeaderValue("invoice_number", "billing_document_number", "document_number", "po_number") ??
        fallbackMappingValue("document_number", ""),
      billing_document_number:
        (row as any).billing_document_number ??
        (row as any).invoice_number ??
        fallbackHeaderValue("billing_document_number", "invoice_number", "document_number") ??
        fallbackMappingValue("billing_document_number", ""),
      document_date:
        (row as any).invoice_date ??
        (row as any).billing_date ??
        (row as any).po_date ??
        fallbackHeaderValue("invoice_date", "billing_date", "document_date", "po_date") ??
        fallbackMappingValue("document_date", ""),
      billing_date:
        (row as any).billing_date ??
        (row as any).invoice_date ??
        fallbackHeaderValue("billing_date", "invoice_date", "document_date") ??
        fallbackMappingValue("billing_date", ""),
      customer_name:
        fallbackHeaderValue("customer_name", "customer", "sold_to_name", "bill_to_name") ??
        (row as any).sender ??
        fallbackMappingValue("customer_name", ""),
      supplier_name:
        fallbackHeaderValue("supplier_name", "supplier", "vendor_name", "bill_from_name") ??
        (row as any).receiver ??
        (row as any).supplier_name ??
        fallbackMappingValue("supplier_name", ""),
      tax_id:
        (row as any).tax_id ??
        (row as any).customer_tax_id ??
        (row as any).supplier_tax_id ??
        fallbackHeaderValue("tax_id", "vat_number", "tin", "tax_identifier", "customer_tax_id", "supplier_tax_id") ??
        fallbackMappingValue("tax_id", ""),
      document_type:
        (row as any).message_family ??
        (row as any).message_type ??
        (row as any).po_type ??
        fallbackHeaderValue("document_type") ??
        fallbackMappingValue("document_type", ""),
      message_family:
        (row as any).message_family ??
        (row as any).message_type ??
        (row as any).po_type ??
        fallbackMappingValue("message_family", ""),
      order_type:
        (row as any).reference_po_number ??
        (row as any).order_type ??
        fallbackHeaderValue("reference_po_number", "order_type") ??
        fallbackMappingValue("order_type", ""),
      reference_po_number:
        (row as any).reference_po_number ??
        fallbackHeaderValue("reference_po_number", "po_number") ??
        fallbackMappingValue("reference_po_number", ""),
      invoice_total:
        (row as any).invoice_total ??
        fallbackHeaderValue("invoice_total", "total_amount", "grand_total") ??
        fallbackMappingValue("invoice_total", ""),
      tax_total:
        (row as any).tax_total ??
        fallbackHeaderValue("tax_total", "vat_total", "tax_amount") ??
        fallbackMappingValue("tax_total", ""),
      language_code:
        (row as any).language_code ??
        fallbackHeaderValue("language_code") ??
        fallbackMappingValue("language_code", ""),
      currency_code:
        (row as any).currency ??
        fallbackHeaderValue("currency_code", "currency") ??
        fallbackMappingValue("currency_code", ""),
      ship_to_code:
        (row as any).ship_to_partner?.code ??
        (row as any).ship_to ??
        fallbackHeaderValue("ship_to_code", "ship_to_id") ??
        fallbackMappingValue("ship_to_code", ""),
      ship_to_name:
        (row as any).ship_to_partner?.name ??
        (row as any).ship_to_name ??
        fallbackHeaderValue("ship_to_name") ??
        fallbackMappingValue("ship_to_name", ""),
      ship_to_address:
        (row as any).ship_to_partner?.address ??
        (row as any).ship_to_address ??
        fallbackHeaderValue("ship_to_address") ??
        fallbackMappingValue("ship_to_address", ""),
      header_details: headerDetailsText || fallbackMappingValue("header_details", ""),
    });

    const sourceItems = [...(((row as any).items as any[]) || [])].sort((a, b) => {
      const aNo = Number(a?.line_no ?? 0);
      const bNo = Number(b?.line_no ?? 0);
      return aNo - bNo;
    });

    const normalizedItems = sourceItems.map((item, idx) => {
      const mappedDeliveryDate = fallbackMappingValue(`items.${idx}.delivery_date`, "");
      return {
        ...item,
        delivery_date:
          mappedDeliveryDate ||
          item?.delivery_date ||
          "",
        line_no:
          item?.line_no === undefined ||
          item?.line_no === null ||
          String(item.line_no).trim() === "" ||
          Number(item.line_no) <= 0
            ? idx + 1
            : Number(item.line_no),
      };
    });

    setItemsDraft(normalizedItems);
    bboxDraftRef.current = {};
    setBBoxDraft({});
    setValueDraft({});
    setDirtyHeaderFields({});
    setDirtyItemFields({});
    setDirtyMappings({});
  }, [row.po_id]);
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

  function normalizeDateInput(v: any) {
    const s = nonEmptyDateOrUndefined(v);
    if (!s) return undefined;

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const compactIso = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compactIso) {
      return `${compactIso[1]}-${compactIso[2]}-${compactIso[3]}`;
    }

    const compactIsoWithTime = s.match(/^(\d{4})(\d{2})(\d{2})\d{2,6}$/);
    if (compactIsoWithTime) {
      return `${compactIsoWithTime[1]}-${compactIsoWithTime[2]}-${compactIsoWithTime[3]}`;
    }

    const slashMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (slashMatch) {
      const month = slashMatch[1].padStart(2, "0");
      const day = slashMatch[2].padStart(2, "0");
      const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
      return `${year}-${month}-${day}`;
    }

    const dotMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (dotMatch) {
      const day = dotMatch[1].padStart(2, "0");
      const month = dotMatch[2].padStart(2, "0");
      const year = dotMatch[3].length === 2 ? `20${dotMatch[3]}` : dotMatch[3];
      return `${year}-${month}-${day}`;
    }

    const isoDateTime = s.match(/^(\d{4}-\d{2}-\d{2})[T\s].*$/);
    if (isoDateTime) {
      return isoDateTime[1];
    }

    return s;
  }

  function buildUpdatePayload() {
    const payload: Record<string, any> = {};
    const effectiveBBoxDraft = bboxDraftRef.current || {};

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
      mappingValueOverrides[`items.${index}.allowance_discount_surcharge`] = item.allowance_discount_surcharge;
      mappingValueOverrides[`items.${index}.delivery_time`] = item.delivery_time;
      mappingValueOverrides[`items.${index}.tax_amount`] = item.tax_amount;
      mappingValueOverrides[`items.${index}.ship_to_override`] = item.ship_to_override;
      mappingValueOverrides[`items.${index}.material_code`] = item.material_code;
      mappingValueOverrides[`items.${index}.mapped_product`] = item.mapped_product;
      mappingValueOverrides[`items.${index}.description`] = item.description;
      mappingValueOverrides[`items.${index}.line_details`] = item.line_details;
      mappingValueOverrides[`items.${index}.quantity`] = item.quantity;
      mappingValueOverrides[`items.${index}.mapped_quantity`] = item.mapped_quantity;
      mappingValueOverrides[`items.${index}.customer_uom`] = item.customer_uom ?? item.uom;
      mappingValueOverrides[`items.${index}.supplier_uom_conversion_factor`] =
        item.supplier_uom_conversion_factor;
      mappingValueOverrides[`items.${index}.unit_price`] = item.unit_price;
      mappingValueOverrides[`items.${index}.amount`] = item.amount;
      mappingValueOverrides[`items.${index}.line_total_amount`] = item.line_total_amount;
    });

    const effectiveMappings = (() => {
      const merged: MappingField[] = [...baseMappings];

      for (const [key, bbox] of Object.entries(effectiveBBoxDraft)) {
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
    })();

    const updatedMappings = effectiveMappings
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
        if (item?.is_deleted) {
          return {
            line_no: toNumberOrNull(item.line_no ?? index + 1),
            is_deleted: true,
            is_corrected: true,
          };
        }

        const obj: Record<string, any> = {};

        if (dirtyItemFields[`${index}.line_no`]) obj.line_no = toNumberOrNull(item.line_no);
        if (dirtyItemFields[`${index}.material_code`]) obj.material_code = item.material_code ?? "";
        if (dirtyItemFields[`${index}.description`]) obj.description = item.description ?? "";
        if (dirtyItemFields[`${index}.quantity`]) obj.quantity = toNumberOrNull(item.quantity);
        if (dirtyItemFields[`${index}.uom`] || dirtyItemFields[`${index}.customer_uom`]) {
          obj.uom = item.customer_uom ?? item.uom ?? "";
        }
        if (dirtyItemFields[`${index}.unit_price`]) obj.unit_price = toNumberOrNull(item.unit_price);
        if (dirtyItemFields[`${index}.amount`]) obj.amount = toNumberOrNull(item.amount);
        if (dirtyItemFields[`${index}.delivery_date`]) {
          obj.delivery_date = normalizeDateInput(item.delivery_date) ?? null;
        }
        if (dirtyItemFields[`${index}.allowance_discount_surcharge`]) obj.allowance_discount_surcharge = item.allowance_discount_surcharge ?? "";
        if (dirtyItemFields[`${index}.tax_amount`]) obj.tax_amount = toNumberOrNull(item.tax_amount);
        if (dirtyItemFields[`${index}.line_total_amount`]) obj.line_total_amount = toNumberOrNull(item.line_total_amount);
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
      if (v !== undefined) {
        payload.po_number = v;
        payload.invoice_number = v;
        payload.billing_document_number = v;
      }
    }

    if (dirtyHeaderFields["document_date"]) {
      const v = normalizeDateInput(headerDraft.document_date) ?? null;
      payload.po_date = v;
      payload.invoice_date = v;
      payload.billing_date = v;
    }

    if (dirtyHeaderFields["customer_name"]) {
      const v = nonEmptyStringOrUndefined(headerDraft.customer_name);
      if (v !== undefined) payload.sender = v;
    }

    if (dirtyHeaderFields["supplier_name"]) {
      const v = nonEmptyStringOrUndefined(headerDraft.supplier_name);
      if (v !== undefined) payload.receiver = v;
    }

    if (dirtyHeaderFields["tax_id"]) {
      const v = nonEmptyStringOrUndefined(headerDraft.tax_id);
      if (v !== undefined) payload.tax_id = v;
    }

    if (dirtyHeaderFields["reference_po_number"]) {
      const v = nonEmptyStringOrUndefined(headerDraft.reference_po_number);
      if (v !== undefined) payload.reference_po_number = v;
    }

    if (dirtyHeaderFields["invoice_total"]) {
      const v = nonEmptyStringOrUndefined(headerDraft.invoice_total);
      if (v !== undefined) payload.invoice_total = v;
    }

    if (dirtyHeaderFields["tax_total"]) {
      const v = nonEmptyStringOrUndefined(headerDraft.tax_total);
      if (v !== undefined) payload.tax_total = v;
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

      const res = await apiFetch(`/purchase-orders/${row.po_id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await parseApiError(res);
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
        const saveRes = await apiFetch(`/purchase-orders/${row.po_id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });

        if (!saveRes.ok) {
          const err = await parseApiError(saveRes);
          throw new Error(err || "Save failed");
        }
      }

      const processRes = await apiFetch(`/purchase-orders/${row.po_id}/reprocess`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      if (!processRes.ok) {
        const err = await parseApiError(processRes);
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

      const res = await apiFetch(`/purchase-orders/${row.po_id}/archive`, {
        method: "POST",
        body: JSON.stringify({ reason, comment }),
      });

      if (!res.ok) {
        const err = await parseApiError(res);
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
            Document: {String((row as any).source_type || "").toUpperCase() === "BUYER_PORTAL"
              ? ((row as any).docnum || (row as any).po_number || "-")
              : ((row as any).invoice_number || (row as any).billing_document_number || (row as any).docnum || (row as any).po_number || "-")}
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
              fileId={(row as any).file_id}
              fileUrl={(row as any).file_url}
              fileName={(row as any).file_name}
              mimeType={(row as any).mime_type}
              rawText={(row as any).raw_text}
              mappings={mergedMappings}
              selectedField={selectedField}
              onSelectField={onSelectField}
              editable={editable}
              onStructuredValueSelect={(fieldKey, value) => {
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
                      nextItems[idx] =
                        field === "customer_uom"
                          ? {
                              ...nextItems[idx],
                              customer_uom: value,
                              uom: value,
                            }
                          : {
                              ...nextItems[idx],
                              [field]: value,
                            };
                      return nextItems;
                    });
                    markItemDirty(idx, field);
                  }
                }
              }}
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
                        nextItems[idx] =
                          field === "customer_uom"
                            ? {
                                ...nextItems[idx],
                                customer_uom: value,
                                uom: value,
                              }
                            : {
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

