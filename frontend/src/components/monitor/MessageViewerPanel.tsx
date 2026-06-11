import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { FaDownload } from "react-icons/fa";
import EdiViewer from "../document/EdiViewer";
import EmailViewer from "../document/EmailViewer";
import SpreadsheetViewer from "../document/SpreadsheetViewer";
import TextViewer from "../document/TextViewer";
import { formatXml, safeJsonParse } from "../document/utils";
import { apiFetch, parseApiError } from "../../utils/api";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type BBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  page?: number;
};

type MappingItem = {
  key?: string;
  label?: string;
  value?: string;
  bbox?: BBox | null;
};

type Props = {
  fileId?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  rawText?: string | null;
  mappings?: MappingItem[];
  selectedField?: string | null;
  onSelectField?: (fieldKey: string) => void;
  onBBoxChange?: (fieldKey: string, bbox: BBox, value?: string) => void;
  onStructuredValueSelect?: (fieldKey: string, value: string) => void;
  editable?: boolean;
};

export default function MessageViewerPanel({
  fileId,
  fileUrl,
  fileName,
  mimeType,
  rawText,
  mappings = [],
  selectedField,
  onSelectField,
  onBBoxChange,
  onStructuredValueSelect,
  editable = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageWrapRef = useRef<HTMLDivElement | null>(null);
  const pageLayerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [pdfBlobUrl, setPdfBlobUrl] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageWidth, setPageWidth] = useState(900);
  const [pdfError, setPdfError] = useState("");
  const [draftBoxes, setDraftBoxes] = useState<Record<string, BBox>>({});
  const [drawing, setDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(
    null
  );
  const [dragBox, setDragBox] = useState<BBox | null>(null);
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const [overlayVersion, setOverlayVersion] = useState(0);
  const [structuredTextContent, setStructuredTextContent] = useState(rawText || "");
  const [downloadMessage, setDownloadMessage] = useState("");

  const lowerMime = (mimeType || "").toLowerCase();
  const lowerFileName = (fileName || "").toLowerCase();
  const effectiveStructuredText = structuredTextContent || rawText || "";
  const xmlContentProbe = effectiveStructuredText.trim();

  const isPdf = !!fileUrl && (lowerMime.includes("pdf") || lowerFileName.endsWith(".pdf"));
  const isImage =
    !!fileUrl &&
    (lowerMime.startsWith("image/") || /\.(png|jpe?g|gif|bmp|webp|tiff?|jfif)$/i.test(lowerFileName));
  const isEmail = lowerMime.includes("message/rfc822") || /\.(eml|msg)$/i.test(lowerFileName);
  const isSpreadsheet =
    lowerMime.includes("spreadsheet") ||
    lowerMime.includes("excel") ||
    lowerMime.includes("csv") ||
    /\.(xlsx|xls|csv|tsv)$/i.test(lowerFileName);
  const isWordDocument =
    lowerMime.includes("word") ||
    lowerMime.includes("officedocument.wordprocessingml") ||
    lowerMime.includes("rtf") ||
    /\.(docx?|rtf)$/i.test(lowerFileName);
  const isJson = lowerMime.includes("json") || /\.json$/i.test(lowerFileName);
  const isXml =
    lowerMime.includes("xml") ||
    /\.(xml|idoc)$/i.test(lowerFileName) ||
    /^<\?xml/i.test(xmlContentProbe) ||
    /<(IDOC|EDI_DC40|INVOIC|ORDERS|DESADV)\b/i.test(xmlContentProbe);
  const isIdocLike = /<(IDOC|EDI_DC40|INVOIC|ORDERS|DESADV)\b/i.test(xmlContentProbe);
  const isEdi =
    /\.(x12|edi|edifact|txt)$/i.test(lowerFileName) &&
      (/\bISA\b/.test(effectiveStructuredText) || /\bUNB\+/.test(effectiveStructuredText) || /\bUNH\+/.test(effectiveStructuredText)) ||
    /\.(x12|edi|edifact)$/i.test(lowerFileName) ||
    (effectiveStructuredText.includes("ISA*") ||
      effectiveStructuredText.includes("ISA~") ||
      effectiveStructuredText.includes("GS*") ||
      effectiveStructuredText.includes("GS~") ||
      effectiveStructuredText.includes("ST*") ||
      effectiveStructuredText.includes("ST~") ||
      effectiveStructuredText.includes("UNH+") ||
      effectiveStructuredText.includes("UNB+"));
  const viewerMode = isPdf ? "pdf" : isImage ? "image" : (isEmail || isSpreadsheet || isWordDocument || isJson || isXml || lowerMime.includes("text") || /\.(x12|edi|edifact|txt)$/i.test(lowerFileName)) ? "text" : "generic";
  const supportsBbox = viewerMode === "pdf" || viewerMode === "image";
  const canEditBbox = editable && supportsBbox;

  type XmlTreeNode = {
    id: string;
    tag: string;
    text: string;
    depth: number;
    children: XmlTreeNode[];
  };

  function buildXmlTree(xmlText: string): XmlTreeNode[] {
    if (!xmlText || !xmlText.trim()) return [];

    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "application/xml");
      if (xmlDoc.querySelector("parsererror")) return [];

      const walk = (node: Element, depth: number, indexPath: string): XmlTreeNode => {
        const children = Array.from(node.children).map((child, idx) =>
          walk(child as Element, depth + 1, `${indexPath}.${idx}`)
        );
        const leafText = children.length ? "" : (node.textContent || "").trim();
        const tag = node.tagName;
        return {
          id: `${indexPath}-${tag}`,
          tag,
          text: leafText,
          depth,
          children,
        };
      };

      const root = xmlDoc.documentElement;
      return root ? [walk(root, 0, "0")] : [];
    } catch {
      return [];
    }
  }

  const structuredXmlSource = structuredTextContent || rawText || "";
  const xmlTree = useMemo(() => buildXmlTree(structuredXmlSource), [structuredXmlSource]);
  const portalOrderPreview = useMemo(() => {
    const parsed = safeJsonParse(structuredTextContent || rawText || "");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return null;

    const items = Array.isArray((parsed as any).items) ? (parsed as any).items : [];
    const hasPortalShape =
      items.length > 0 &&
      (
        "buyer_email" in (parsed as any) ||
        "company_name" in (parsed as any) ||
        "client_id" in (parsed as any)
      );

    if (!hasPortalShape) return null;

    const currency = String((parsed as any).currency || "USD");
    const subtotal = items.reduce((sum: number, item: any) => {
      const quantity = Number(item?.quantity || 0);
      const unitPrice = Number(item?.unit_price || 0);
      return sum + quantity * unitPrice;
    }, 0);

    return {
      documentNumber: String((parsed as any).po_number || (parsed as any).document_number || fileName || "Buyer Portal Order"),
      documentDate: String((parsed as any).document_date || ""),
      clientName: String((parsed as any).client_name || (parsed as any).receiver_name || (parsed as any).client_id || ""),
      buyerCompany: String((parsed as any).company_name || (parsed as any).buyer_name || (parsed as any).buyer_email || ""),
      buyerEmail: String((parsed as any).buyer_email || ""),
      soldTo: String((parsed as any).sold_to || ""),
      shipTo: String((parsed as any).ship_to || ""),
      shipToAddress: String((parsed as any).ship_to_address || ""),
      notes: String((parsed as any).notes || ""),
      paymentMethod: String((parsed as any).payment_method || ""),
      paymentReference: String((parsed as any).payment_reference || ""),
      currency,
      subtotal,
      items,
    };
  }, [fileName, rawText, structuredTextContent]);
  const pdfOptions = useMemo(
    () => ({
      cMapUrl: "https://unpkg.com/pdfjs-dist@5.4.296/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "https://unpkg.com/pdfjs-dist@5.4.296/standard_fonts/",
    }),
    []
  );

  const parsedEmail = useMemo(() => {
    if (!isEmail) return null;
    const content = rawText || "";
    if (!content.trim()) return null;

    const normalized = content.replace(/\r\n/g, "\n");
    const parts = normalized.split(/\n\s*\n/);
    const headerBlock = parts[0] || "";
    const bodyBlock = parts.slice(1).join("\n\n").trim() || normalized;

    const headers: Record<string, string> = {};
    for (const line of headerBlock.split("\n")) {
      const match = line.match(/^([A-Za-z-]+):\s*(.+)$/);
      if (match) {
        headers[match[1].toLowerCase()] = match[2].trim();
      }
    }

    const htmlBody =
      bodyBlock.includes("<html") ||
      bodyBlock.includes("<body") ||
      bodyBlock.includes("<div")
        ? bodyBlock
        : "";

    return {
      from: headers["from"] || "",
      to: headers["to"] || "",
      cc: headers["cc"] || "",
      subject: headers["subject"] || "",
      date: headers["date"] || "",
      bodyText: bodyBlock,
      bodyHtml: htmlBody,
    };
  }, [isEmail, rawText]);

  async function downloadBlob(url: string, fallbackName: string) {
    const res = await apiFetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(await parseApiError(res));
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fallbackName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  function downloadInlineContent(content: string, fallbackName: string, mime = "text/plain") {
    const blob = new Blob([content], { type: mime });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fallbackName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  async function handleViewerDownload() {
    try {
      setDownloadMessage("");
      if (fileUrl) {
        await downloadBlob(fileUrl, fileName || "document");
        return;
      }
      const content = structuredTextContent || rawText || "";
      if (!content.trim()) {
        throw new Error("No document content is available to download.");
      }
      const mime = isJson ? "application/json" : isXml ? "application/xml" : "text/plain";
      const extension = isJson ? "json" : isXml ? "xml" : "txt";
      downloadInlineContent(content, fileName || `document.${extension}`, mime);
    } catch (error: any) {
      setDownloadMessage(error?.message || "Failed to download document.");
    }
  }

  useEffect(() => {
    let active = true;

    async function loadStructuredTextFallback() {
      const initial = rawText || "";
      setStructuredTextContent(initial);

      if (initial.trim() || !fileUrl || viewerMode === "pdf" || viewerMode === "image") {
        return;
      }

      try {
        const response = await fetch(fileUrl, { method: "GET" });
        if (!response.ok) return;
        const textPayload = await response.text();
        if (active) {
          setStructuredTextContent(textPayload || "");
        }
      } catch (error) {
        console.error("Structured text fetch failed:", error);
      }
    }

    void loadStructuredTextFallback();
    return () => {
      active = false;
    };
  }, [rawText, fileUrl, viewerMode]);

  const mappingLabelByKey = useMemo(() => {
    const map: Record<string, string> = {};
    (mappings || []).forEach((mapping) => {
      if (mapping?.key && mapping?.label) {
        map[String(mapping.key)] = String(mapping.label);
      }
    });
    return map;
  }, [mappings]);

  function isStructuredField(fieldKey?: string | null) {
    const key = String(fieldKey || "");
    return (
      key === "document_number" ||
      key === "po_number" ||
      key === "invoice_number" ||
      key === "billing_document_number" ||
      key === "reference_po_number" ||
      key === "document_date" ||
      key === "po_date" ||
      key === "invoice_date" ||
      key === "invoice_total" ||
      key === "tax_total" ||
      key === "net_amount" ||
      key === "receipt_number" ||
      key === "receipt_total" ||
      key.endsWith(".material_code") ||
      key.endsWith(".mapped_product") ||
      key.endsWith(".delivery_date") ||
      key.endsWith(".customer_uom") ||
      key.endsWith(".uom")
    );
  }

  function normalizeExtractedValue(fieldKey: string | null | undefined, rawValue: string) {
    const key = String(fieldKey || "");
    const text = String(rawValue || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return "";

    if (key === "document_number" || key === "po_number" || key === "invoice_number" || key === "billing_document_number" || key === "reference_po_number") {
      const labelled =
        text.match(
          /(?:invoice\s*number|invoice\s*no|billing\s*document\s*number|billing\s*number|reference\s*po\s*number|po\s*number(?:\/date)?|purchase\s*order|document\s*number)\s*[:\-]?\s*([A-Z0-9][A-Z0-9/_-]{4,40})/i
        ) ||
        text.match(/\b([A-Z]{1,6}-\d{3,20})\b/i) ||
        text.match(/\b([A-Z0-9][A-Z0-9/_-]{5,40})\b/);
      return labelled?.[1]?.trim() || text;
    }

    if (key === "document_date" || key === "po_date" || key === "invoice_date" || key === "billing_date" || key.endsWith(".delivery_date")) {
      const dateMatch = text.match(
        /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4}|\d{1,2}[A-Z]{3}\d{2,4})\b/i
      );
      return dateMatch?.[1]?.trim() || text;
    }

    if (
      key === "invoice_total" ||
      key === "tax_total" ||
      key === "tax_amount" ||
      key === "line_total_amount" ||
      key === "allowance_discount_surcharge" ||
      key === "unit_price" ||
      key.endsWith(".unit_price") ||
      key.endsWith(".amount")
    ) {
      const numericMatch = text.match(/-?\d[\d,]*(?:\.\d+)?/);
      return numericMatch ? numericMatch[0].replace(/,/g, "") : text;
    }

    if (key.endsWith(".material_code") || key.endsWith(".mapped_product")) {
      const candidates = text.match(/\b[A-Z0-9][A-Z0-9/_-]{3,}\b/gi) || [];
      const filtered = candidates.filter((token) => {
        const upper = token.toUpperCase();
        if (["MATERIAL", "PRODUCT", "ITEM", "DESCRIPTION"].includes(upper)) {
          return false;
        }
        return /\d/.test(token) || /[-_/]/.test(token);
      });

      if (filtered.length > 0) {
        filtered.sort((a, b) => b.length - a.length);
        return filtered[0].trim();
      }

      const productMatch =
        text.match(/\b([A-Z0-9]+(?:[-_/][A-Z0-9]+)+)\b/i) ||
        text.match(/\b([A-Z]{1,6}\d[A-Z0-9/_-]{2,})\b/i);
      return productMatch?.[1]?.trim() || "";
    }

    if (key.endsWith(".customer_uom") || key.endsWith(".uom")) {
      const blocked = new Set([
        "UOM",
        "UNIT",
        "UNITS",
        "QTY",
        "QUANTITY",
        "ORDER",
        "ORDERQTY",
        "MATERIAL",
        "DESCRIPTION",
      ]);
      const preferred = [
        "EA",
        "PCS",
        "PC",
        "PIECE",
        "PIECES",
        "KG",
        "G",
        "LB",
        "LBS",
        "L",
        "ML",
        "M",
        "MM",
        "CM",
        "BOX",
        "PACK",
        "SET",
      ];

      const tokens = (text.match(/\b[A-Za-z]{1,12}\b/g) || [])
        .map((token) => token.trim())
        .filter(Boolean);

      const preferredMatch = tokens.find((token) =>
        preferred.includes(token.toUpperCase())
      );

      const genericMatch = tokens.find(
        (token) => !blocked.has(token.toUpperCase())
      );

      const matched = preferredMatch || genericMatch || "";
      if (/^pieces?$/i.test(matched)) return "Piece";
      if (/^pcs?$/i.test(matched)) return matched.toUpperCase();
      return matched.toUpperCase() === "PIECE" ? "Piece" : matched;
    }

    return text;
  }


  function displayFieldLabel(mapping: MappingItem | { key?: string; label?: string }) {
    const key = String(mapping?.key || "");
    const providedLabel = String(mapping?.label || mappingLabelByKey[key] || "").trim();
    if (providedLabel) return providedLabel;

    const itemMatch = key.match(/^items\.(\d+)\.(.+)$/);
    if (itemMatch) {
      const displayLineNo = Number(itemMatch[1]) + 1;
      return `Line ${displayLineNo} - ${itemMatch[2]}`;
    }

    return key || "Field";
  }

  function getDisplayLineNo(mapping: MappingItem | { key?: string; label?: string }) {
    const providedLabel = String(mapping?.label || "").trim();
    const labelMatch = providedLabel.match(/^Line\s+(\d+)\b/i);
    if (labelMatch) return Number(labelMatch[1]);

    const key = String(mapping?.key || "");
    const itemMatch = key.match(/^items\.(\d+)\./);
    if (itemMatch) return Number(itemMatch[1]) + 1;
    return null;
  }

  useEffect(() => {
    let active = true;
    let objectUrl = "";

    async function loadDocumentBlob() {
      if ((!isPdf && !isImage) || !fileUrl) {
        setPdfBlobUrl("");
        setPdfError("");
        return;
      }
      try {
        setPdfError("");
        const response = await fetch(fileUrl, { method: "GET" });
        if (!response.ok) {
          if (active) {
            setPdfBlobUrl("");
            if (response.status === 410) {
              setPdfError("Original document unavailable - migrated record. PO metadata is still accessible.");
            } else if (response.status === 404) {
              setPdfError("Document not found.");
            } else {
              setPdfError(`Unable to fetch document (${response.status})`);
            }
          }
          return;
        }
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const errData = await response.json();
          if (active) {
            setPdfBlobUrl("");
            setPdfError(errData.message || "Document unavailable.");
          }
          return;
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (active) {
          setPdfBlobUrl(objectUrl);
        }
      } catch (error) {
        console.error("Document fetch failed:", error);
        if (active) {
          setPdfBlobUrl("");
          setPdfError("Document fetch failed");
        }
      }
    }

    loadDocumentBlob();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isPdf, isImage, fileUrl]);

  useEffect(() => {
    function resize() {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      setPageWidth(Math.max(320, width - 32));
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    if (!pageLayerRef.current) return;

    const pageEl =
      pageLayerRef.current.querySelector(".react-pdf__Page") as HTMLElement | null;

    if (!pageEl) return;

    const observer = new ResizeObserver(() => {
      setOverlayVersion((v) => v + 1);
    });

    observer.observe(pageEl);

    return () => observer.disconnect();
  }, [pdfBlobUrl, pageNumber, pageWidth]);

  function getSurfaceElement() {
    const pdfEl =
      pageLayerRef.current?.querySelector(".react-pdf__Page") as HTMLElement | null;
    if (pdfEl) return pdfEl;
    return imageRef.current as HTMLElement | null;
  }

  function getOverlaySize() {
    const pageEl = getSurfaceElement();

    if (pageEl) {
      const rect = pageEl.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
      };
    }

    return null;
  }

  function getPageRect() {
    const pageEl = getSurfaceElement();

    if (!pageEl || !pageWrapRef.current) return null;

    const pageRect = pageEl.getBoundingClientRect();
    const wrapRect = pageWrapRef.current.getBoundingClientRect();

    return {
      left: pageRect.left - wrapRect.left,
      top: pageRect.top - wrapRect.top,
      width: pageRect.width,
      height: pageRect.height,
    };
  }

  function getRelativePoint(clientX: number, clientY: number) {
    const pageRect = getPageRect();
    const wrapRect = pageWrapRef.current?.getBoundingClientRect();
    if (!pageRect || !wrapRect) return null;

    return {
      x: clientX - wrapRect.left - pageRect.left,
      y: clientY - wrapRect.top - pageRect.top,
    };
  }

  function toDisplayBox(bbox: BBox): BBox {
    const size = getOverlaySize();
    if (!size) return bbox;

    const isNormalized =
      bbox.x >= 0 &&
      bbox.y >= 0 &&
      bbox.width >= 0 &&
      bbox.height >= 0 &&
      bbox.x <= 1 &&
      bbox.y <= 1 &&
      bbox.width <= 1 &&
      bbox.height <= 1;

    if (isNormalized) {
      return {
        x: bbox.x * size.width,
        y: bbox.y * size.height,
        width: bbox.width * size.width,
        height: bbox.height * size.height,
        page: bbox.page,
      };
    }

    return bbox;
  }

  function extractTextFromBBox(bbox: BBox): string {
    if (viewerMode !== "pdf") return "";

    const structuredField = isStructuredField(selectedField);
    const uomField =
      String(selectedField || "").endsWith(".customer_uom") ||
      String(selectedField || "").endsWith(".uom");
    function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
      return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
    }

    const textLayer =
      (pageLayerRef.current?.querySelector(
        ".react-pdf__Page__textContent"
      ) as HTMLElement | null) ||
      (pageLayerRef.current?.querySelector(
        ".react-pdf__Page__textContent.textLayer"
      ) as HTMLElement | null);

    const wrapRect = pageWrapRef.current?.getBoundingClientRect();

    const pageRect = getPageRect();
    if (!textLayer || !wrapRect || !pageRect) return "";

    const spans = Array.from(textLayer.querySelectorAll("span"));

    const padX = Math.min(3, Math.max(1, bbox.width * 0.06));
    const padY = Math.min(2, Math.max(1, bbox.height * 0.08));

    const innerBox = {
      left: bbox.x + padX,
      top: bbox.y + padY,
      right: bbox.x + bbox.width - padX,
      bottom: bbox.y + bbox.height - padY,
    };

    const words: { text: string; x: number; y: number }[] = [];

    spans.forEach((span) => {
      const el = span as HTMLElement;
      const rect = el.getBoundingClientRect();
      const text = (el.textContent || "").trim();

      if (!text) return;

      const x = rect.left - wrapRect.left - pageRect.left;
      const y = rect.top - wrapRect.top - pageRect.top;
      const w = rect.width;
      const h = rect.height;

      const centerX = x + w / 2;
      const centerY = y + h / 2;
      const xOverlap = overlap(x, x + w, innerBox.left, innerBox.right);
      const yOverlap = overlap(y, y + h, innerBox.top, innerBox.bottom);
      const widthRatio = xOverlap / Math.max(1, w);
      const heightRatio = yOverlap / Math.max(1, h);

      const inside = structuredField
        ? uomField
          ? widthRatio >= 0.08 && heightRatio >= 0.2
          : widthRatio >= 0.2 && heightRatio >= 0.2
        : centerX >= innerBox.left &&
          centerX <= innerBox.right &&
          centerY >= innerBox.top &&
          centerY <= innerBox.bottom &&
          widthRatio >= 0.55 &&
          heightRatio >= 0.55;

      if (inside) {
        words.push({ text, x, y });
      }
    });

    words.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 4) return a.y - b.y;
      return a.x - b.x;
    });

    const extracted = words.map((w) => w.text).join(" ").trim();
    if (extracted) {
      return normalizeExtractedValue(selectedField, extracted);
    }

    if (!structuredField) {
      return "";
    }

    const fallbackWords: { text: string; x: number; y: number }[] = [];

    spans.forEach((span) => {
      const el = span as HTMLElement;
      const rect = el.getBoundingClientRect();
      const text = (el.textContent || "").trim();

      if (!text) return;

      const x = rect.left - wrapRect.left - pageRect.left;
      const y = rect.top - wrapRect.top - pageRect.top;
      const w = rect.width;
      const h = rect.height;
      const centerX = x + w / 2;
      const centerY = y + h / 2;

      const xOverlap = overlap(x, x + w, bbox.x, bbox.x + bbox.width);
      const yOverlap = overlap(y, y + h, bbox.y, bbox.y + bbox.height);
      const widthRatio = xOverlap / Math.max(1, w);
      const heightRatio = yOverlap / Math.max(1, h);

      const inside =
        centerX >= bbox.x &&
        centerX <= bbox.x + bbox.width &&
        centerY >= bbox.y &&
        centerY <= bbox.y + bbox.height;

      if (inside || (widthRatio >= 0.45 && heightRatio >= 0.45)) {
        fallbackWords.push({ text, x, y });
      }
    });

    fallbackWords.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 4) return a.y - b.y;
      return a.x - b.x;
    });

    return normalizeExtractedValue(
      selectedField,
      fallbackWords.map((w) => w.text).join(" ").trim()
    );
  }

  const visibleBoxes = useMemo(() => {
    const safeMappings = Array.isArray(mappings) ? mappings : [];

    const saved = safeMappings
      .filter(
        (m) =>
          m &&
          m.key &&
          m.bbox &&
          typeof m.bbox.x === "number" &&
          typeof m.bbox.y === "number" &&
          typeof m.bbox.width === "number" &&
          typeof m.bbox.height === "number"
      )
      .map((m) => ({
        key: m.key as string,
        label: displayFieldLabel(m),
        lineNo: getDisplayLineNo(m),
        bbox: toDisplayBox(m.bbox as BBox),
      }))
      .filter((m) => (m.bbox.page || 1) === pageNumber);

    const drafts = Object.entries(draftBoxes)
      .map(([key, bbox]) => ({
        key,
        label: displayFieldLabel({ key }),
        lineNo: getDisplayLineNo({ key }),
        bbox: toDisplayBox(bbox),
      }))
      .filter((m) => (m.bbox.page || 1) === pageNumber);

    const merged = [...saved];

    for (const d of drafts) {
      const idx = merged.findIndex((x) => x.key === d.key);
      if (idx >= 0) merged[idx] = d;
      else merged.push(d);
    }

    return merged;
  }, [mappings, draftBoxes, pageNumber, overlayVersion, mappingLabelByKey]);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!canEditBbox || !selectedField || (!pdfBlobUrl && viewerMode !== "image")) return;

    const p = getRelativePoint(e.clientX, e.clientY);
    if (!p) return;

    e.currentTarget.setPointerCapture?.(e.pointerId);

    setDrawing(true);
    setStartPoint(p);
    setDragBox({
      x: p.x,
      y: p.y,
      width: 0,
      height: 0,
      page: pageNumber,
    });
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drawing || !startPoint) return;

    const p = getRelativePoint(e.clientX, e.clientY);
    if (!p) return;

    setDragBox({
      x: Math.min(startPoint.x, p.x),
      y: Math.min(startPoint.y, p.y),
      width: Math.abs(p.x - startPoint.x),
      height: Math.abs(p.y - startPoint.y),
      page: pageNumber,
    });
  }

  async function finishDrawing() {
    if (!dragBox || !selectedField) {
      setDrawing(false);
      setStartPoint(null);
      setDragBox(null);
      return;
    }

    const size = getOverlaySize();
    if (!size) {
      setDrawing(false);
      setStartPoint(null);
      setDragBox(null);
      return;
    }

    if (dragBox.width < 5 || dragBox.height < 5) {
      setDrawing(false);
      setStartPoint(null);
      setDragBox(null);
      return;
    }

    const normalized: BBox = {
      x: dragBox.x / size.width,
      y: dragBox.y / size.height,
      width: dragBox.width / size.width,
      height: dragBox.height / size.height,
      page: pageNumber,
    };

    let extractedText: string | undefined;
    if (viewerMode === "pdf") {
      extractedText = extractTextFromBBox(dragBox);
    } else if (viewerMode === "image" && fileId) {
      try {
        const response = await fetch(`/files/${fileId}/ocr-region`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            x: normalized.x,
            y: normalized.y,
            width: normalized.width,
            height: normalized.height,
            page: normalized.page || 1,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          extractedText = normalizeExtractedValue(selectedField, String(data?.text || ""));
        }
      } catch (error) {
        console.error("Image OCR extraction failed:", error);
      }
    }

    setDraftBoxes((prev) => ({
      ...prev,
      [selectedField]: normalized,
    }));

    onBBoxChange?.(selectedField, normalized, extractedText);

    setDrawing(false);
    setStartPoint(null);
    setDragBox(null);
  }

  function handlePointerUp() {
    void finishDrawing();
  }

  const pageRect = getPageRect();

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        height: 620,
        border: "1px solid #dbe4ee",
        borderRadius: 10,
        overflow: "hidden",
        background: "#f8fafc",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {viewerMode === "pdf" ? (
        <div
          style={{ height: "100%", display: "grid", gridTemplateRows: "44px 1fr" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              borderBottom: "1px solid #dbe4ee",
              background: "#fff",
            }}
            >
            <div>
              <div style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>
                {fileName || "Original Document"}
              </div>
              {canEditBbox && (
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                  {selectedField
                    ? `Draw on the document to update ${selectedField}.`
                    : "Select a field on the right, then drag a box on the document."}
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                disabled={pageNumber <= 1}
                style={navBtn(pageNumber <= 1)}
              >
                Prev
              </button>

              <div
                style={{
                  fontSize: 12,
                  color: "#334155",
                  minWidth: 80,
                  textAlign: "center",
                }}
              >
                Page {pageNumber} / {numPages || 1}
              </div>

              <button
                type="button"
                onClick={() => setPageNumber((p) => Math.min(numPages || 1, p + 1))}
                disabled={pageNumber >= (numPages || 1)}
                style={navBtn(pageNumber >= (numPages || 1))}
              >
                Next
              </button>

              <button
                type="button"
                onClick={() => void handleViewerDownload()}
                style={{
                  border: "1px solid #dbe4ee",
                  background: "#fff",
                  color: "#0f172a",
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                }}
                title="Download Original Document"
              >
                <FaDownload />
                Download
              </button>
            </div>
          </div>

          <div style={{ overflow: "auto", padding: 12 }}>
            {pdfBlobUrl ? (
              <div
                ref={pageWrapRef}
                style={{
                  position: "relative",
                  width: pageWidth,
                  margin: "0 auto",
                  background: "#fff",
                  boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
                }}
              >
                <div ref={pageLayerRef}>
                  <Document
                    file={pdfBlobUrl}
                    options={pdfOptions}
                    onLoadSuccess={(loadedPdf) => {
                      const pages = loadedPdf?.numPages || 1;
                      setNumPages(pages);
                      setPageNumber((prev) => Math.min(prev, pages || 1));
                      setPdfError("");
                    }}
                    onSourceError={(err) => {
                      console.error("PDF SOURCE ERROR:", err);
                      setPdfError("Unable to fetch PDF source.");
                    }}
                    onLoadError={(err) => {
                      console.error("PDF LOAD ERROR:", err);
                      setPdfError("Unable to load PDF. Check cMaps / fonts.");
                    }}
                    loading={<ViewerPlaceholder text="Loading PDF..." />}
                    error={
                      <ViewerPlaceholder
                        text={pdfError || "Failed to load PDF file."}
                      />
                    }
                  >
                    <Page
                      pageNumber={pageNumber}
                      width={pageWidth}
                      renderAnnotationLayer={false}
                      renderTextLayer={true}
                    />
                  </Document>
                </div>

                <div
                  style={{
                    position: "absolute",
                    left: pageRect?.left ?? 0,
                    top: pageRect?.top ?? 0,
                    width: pageRect?.width ?? "100%",
                    height: pageRect?.height ?? "100%",
                    zIndex: 10,
                    pointerEvents: "auto",
                    cursor: canEditBbox && selectedField ? "crosshair" : "default",
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  {visibleBoxes.map((box) => {
                    const isSelected = selectedField === box.key;
                    const isHovered = hoveredField === box.key;

                    return (
                      <div
                        key={box.key}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectField?.(box.key);
                        }}
                        onMouseEnter={() => setHoveredField(box.key)}
                        onMouseLeave={() => setHoveredField(null)}
                        style={{
                          position: "absolute",
                          left: box.bbox.x,
                          top: box.bbox.y,
                          width: box.bbox.width,
                          height: box.bbox.height,
                          border: isSelected
                            ? "2px solid #0b5fff"
                            : isHovered
                            ? "2px solid #16a34a"
                            : "2px solid rgba(11,95,255,0.65)",
                          background: isSelected
                            ? "rgba(11,95,255,0.20)"
                            : isHovered
                            ? "rgba(22,163,74,0.16)"
                            : "rgba(11,95,255,0.10)",
                          boxSizing: "border-box",
                          borderRadius: 4,
                          pointerEvents: "auto",
                          transition: "all 120ms ease",
                        }}
                        title={
                          box.lineNo
                            ? String(box.label || box.key).replace(/^Line\s+\d+\b/i, `Line ${box.lineNo}`)
                            : box.label || box.key
                        }
                      />
                    );
                  })}

                  {dragBox && (
                    <div
                      style={{
                        position: "absolute",
                        left: dragBox.x,
                        top: dragBox.y,
                        width: dragBox.width,
                        height: dragBox.height,
                        border: "2px dashed #0b5fff",
                        background: "rgba(11,95,255,0.08)",
                        boxSizing: "border-box",
                        pointerEvents: "none",
                      }}
                    />
                  )}
                </div>
              </div>
            ) : (
              <ViewerPlaceholder text={pdfError || "Loading PDF..."} />
            )}
          </div>
        </div>
      ) : viewerMode === "image" ? (
        <div style={{ height: "100%", display: "grid", gridTemplateRows: "44px 1fr" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              borderBottom: "1px solid #dbe4ee",
              background: "#fff",
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>
                {fileName || "Original Image"}
              </div>
              {canEditBbox && (
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                  {selectedField
                    ? `Draw on the image to map ${selectedField}.`
                    : "Select a field on the right, then drag a box on the image."}
                </div>
              )}
            </div>

            <a
              href={fileUrl || "#"}
              target="_blank"
              rel="noreferrer"
              style={{
                border: "1px solid #dbe4ee",
                background: fileUrl ? "#fff" : "#f8fafc",
                color: fileUrl ? "#0f172a" : "#94a3b8",
                borderRadius: 8,
                padding: "6px 10px",
                textDecoration: "none",
                fontSize: 12,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                pointerEvents: fileUrl ? "auto" : "none",
              }}
              title="Download Original Document"
            >
              <FaDownload />
              Download
            </a>
          </div>

          <div style={{ overflow: "auto", padding: 12 }}>
            {pdfBlobUrl ? (
              <div
                ref={pageWrapRef}
                style={{
                  position: "relative",
                  width: pageWidth,
                  margin: "0 auto",
                  background: "#fff",
                  boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
                }}
              >
                <img
                  ref={imageRef}
                  src={pdfBlobUrl}
                  alt={fileName || "Original image"}
                  onLoad={() => setOverlayVersion((v) => v + 1)}
                  style={{ display: "block", width: "100%", height: "auto" }}
                />

                <div
                  style={{
                    position: "absolute",
                    left: pageRect?.left ?? 0,
                    top: pageRect?.top ?? 0,
                    width: pageRect?.width ?? "100%",
                    height: pageRect?.height ?? "100%",
                    zIndex: 10,
                    pointerEvents: "auto",
                    cursor: canEditBbox && selectedField ? "crosshair" : "default",
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  {visibleBoxes.map((box) => {
                    const isSelected = selectedField === box.key;
                    const isHovered = hoveredField === box.key;

                    return (
                      <div
                        key={box.key}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectField?.(box.key);
                        }}
                        onMouseEnter={() => setHoveredField(box.key)}
                        onMouseLeave={() => setHoveredField(null)}
                        style={{
                          position: "absolute",
                          left: box.bbox.x,
                          top: box.bbox.y,
                          width: box.bbox.width,
                          height: box.bbox.height,
                          border: isSelected
                            ? "2px solid #0b5fff"
                            : isHovered
                            ? "2px solid #16a34a"
                            : "2px solid rgba(11,95,255,0.65)",
                          background: isSelected
                            ? "rgba(11,95,255,0.20)"
                            : isHovered
                            ? "rgba(22,163,74,0.16)"
                            : "rgba(11,95,255,0.10)",
                          boxSizing: "border-box",
                          borderRadius: 4,
                          pointerEvents: "auto",
                          transition: "all 120ms ease",
                        }}
                        title={
                          box.lineNo
                            ? String(box.label || box.key).replace(/^Line\s+\d+\b/i, `Line ${box.lineNo}`)
                            : box.label || box.key
                        }
                      />
                    );
                  })}

                  {dragBox && (
                    <div
                      style={{
                        position: "absolute",
                        left: dragBox.x,
                        top: dragBox.y,
                        width: dragBox.width,
                        height: dragBox.height,
                        border: "2px dashed #0b5fff",
                        background: "rgba(11,95,255,0.08)",
                        boxSizing: "border-box",
                        pointerEvents: "none",
                      }}
                    />
                  )}
                </div>
              </div>
            ) : (
              <ViewerPlaceholder text={pdfError || "Loading image..."} />
            )}
          </div>
        </div>
      ) : viewerMode === "text" ? (
        <div style={{ height: "100%", display: "grid", gridTemplateRows: "44px 1fr" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              borderBottom: "1px solid #dbe4ee",
              background: "#fff",
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>
                {fileName || "Document Preview"}
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                {isEmail
                  ? "Email preview mode"
                  : isSpreadsheet
                  ? "Spreadsheet/text preview mode"
                  : isWordDocument
                  ? "Word/text preview mode"
                  : "Structured text preview mode"}
              </div>
            </div>
            <a
              href={fileUrl || "#"}
              target="_blank"
              rel="noreferrer"
              style={{
                border: "1px solid #dbe4ee",
                background: fileUrl ? "#fff" : "#f8fafc",
                color: fileUrl ? "#0f172a" : "#94a3b8",
                borderRadius: 8,
                padding: "6px 10px",
                textDecoration: "none",
                fontSize: 12,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                pointerEvents: fileUrl ? "auto" : "none",
              }}
            >
              <FaDownload />
              Download
            </a>
          </div>
          <div
            style={{
              padding: 14,
              height: "100%",
              overflow: "auto",
              color: "#334155",
              fontSize: 13,
              background: "#fff",
            }}
          >
            {downloadMessage ? (
              <div
                style={{
                  marginBottom: 12,
                  border: "1px solid #fecaca",
                  background: "#fef2f2",
                  color: "#b91c1c",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {downloadMessage}
              </div>
            ) : null}
            {isSpreadsheet ? (
              <SpreadsheetViewer fileUrl={fileUrl || undefined} rawText={structuredTextContent || rawText || undefined} selectedField={selectedField} onValueSelect={(value) => { if (selectedField) onStructuredValueSelect?.(selectedField, normalizeExtractedValue(selectedField, value)); }} />
            ) : isEdi ? (
              <EdiViewer content={structuredTextContent || rawText || ""} selectedField={selectedField} onValueSelect={(value) => { if (selectedField) onStructuredValueSelect?.(selectedField, normalizeExtractedValue(selectedField, value)); }} />
            ) : isEmail ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ border: "1px solid #dbe4ee", borderRadius: 12, background: "#fff", padding: 14, display: "grid", gap: 8 }}>
                  <EmailMetaRow label="From" value={parsedEmail?.from} />
                  <EmailMetaRow label="To" value={parsedEmail?.to} />
                  <EmailMetaRow label="CC" value={parsedEmail?.cc} />
                  <EmailMetaRow label="Subject" value={parsedEmail?.subject} />
                  <EmailMetaRow label="Date" value={parsedEmail?.date} />
                </div>
                {parsedEmail?.bodyHtml ? (
                  <EmailViewer content={parsedEmail.bodyHtml} />
                ) : (
                  <TextViewer content={parsedEmail?.bodyText || structuredTextContent || rawText || "No email body available."} />
                )}
              </div>
            ) : isXml ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    border: "1px solid #dbe4ee",
                    borderRadius: 12,
                    background: "#f8fafc",
                    padding: "10px 14px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>
                      {isIdocLike ? "IDoc / XML Preview" : "XML Preview"}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                      {selectedField ? `Click a segment line to map ${selectedField}.` : "Click a segment line to map it to the selected field."}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#0b5fff" }}>
                    {isIdocLike ? "IDOC" : "XML"}
                  </div>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {xmlTree.map((node) => (
                    <XmlTreeNodeView
                      key={node.id}
                      node={node}
                      selectedField={selectedField}
                      onStructuredValueSelect={onStructuredValueSelect}
                      normalizeExtractedValue={normalizeExtractedValue}
                    />
                  ))}
                </div>
              </div>
            ) : isJson ? (
              portalOrderPreview ? (
                <div style={{ display: "grid", gap: 14 }}>
                  <div
                    style={{
                      border: "1px solid #dbe4ee",
                      borderRadius: 16,
                      background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
                      padding: 18,
                      boxShadow: "0 14px 30px rgba(37, 99, 235, 0.08)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#2563eb", letterSpacing: "0.08em" }}>
                          BUYER PORTAL PURCHASE ORDER
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: "#0f172a", marginTop: 6 }}>
                          {portalOrderPreview.documentNumber}
                        </div>
                        <div style={{ fontSize: 13, color: "#475569", marginTop: 6 }}>
                          {portalOrderPreview.documentDate || "Document date not provided"}
                        </div>
                      </div>
                      <div
                        style={{
                          minWidth: 240,
                          border: "1px solid #dbe4ee",
                          borderRadius: 14,
                          background: "#fff",
                          padding: 14,
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        <PreviewRow label="Buyer company" value={portalOrderPreview.buyerCompany} />
                        <PreviewRow label="Buyer email" value={portalOrderPreview.buyerEmail} />
                        <PreviewRow label="Client" value={portalOrderPreview.clientName} />
                        <PreviewRow label="Payment method" value={portalOrderPreview.paymentMethod} />
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 14 }}>
                      <PreviewCard title="Sold-to" value={portalOrderPreview.soldTo || "-"} />
                      <PreviewCard title="Ship-to" value={portalOrderPreview.shipTo || "-"} />
                      <PreviewCard title="Ship-to address" value={portalOrderPreview.shipToAddress || "-"} />
                      <PreviewCard title="Payment reference" value={portalOrderPreview.paymentReference || "-"} />
                    </div>

                    {portalOrderPreview.notes ? (
                      <div
                        style={{
                          marginTop: 14,
                          border: "1px solid #dbe4ee",
                          borderRadius: 14,
                          background: "#fff",
                          padding: 14,
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#2563eb", marginBottom: 6 }}>
                          BUYER NOTES
                        </div>
                        <div style={{ fontSize: 13, color: "#334155", whiteSpace: "pre-wrap" }}>
                          {portalOrderPreview.notes}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div
                    style={{
                      border: "1px solid #dbe4ee",
                      borderRadius: 16,
                      background: "#fff",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "96px 1.6fr 0.8fr 0.8fr 0.9fr 1fr",
                        gap: 0,
                        background: "#eff6ff",
                        borderBottom: "1px solid #dbe4ee",
                      }}
                    >
                      {["SKU", "Description", "Qty", "UOM", "Unit price", "Line total"].map((label) => (
                        <div key={label} style={{ padding: "12px 14px", fontSize: 12, fontWeight: 800, color: "#1d4ed8" }}>
                          {label}
                        </div>
                      ))}
                    </div>
                    {portalOrderPreview.items.map((item: any, index: number) => {
                      const quantity = Number(item?.quantity || 0);
                      const unitPrice = Number(item?.unit_price || 0);
                      const lineTotal = quantity * unitPrice;
                      return (
                        <div
                          key={`${item?.sku || item?.name || "item"}-${index}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "96px 1.6fr 0.8fr 0.8fr 0.9fr 1fr",
                            gap: 0,
                            borderBottom: index === portalOrderPreview.items.length - 1 ? "none" : "1px solid #eef2f7",
                          }}
                        >
                          <div style={tableCell}>{item?.sku || "-"}</div>
                          <div style={tableCell}>
                            <div style={{ fontWeight: 700, color: "#0f172a" }}>{item?.name || item?.description || "Product"}</div>
                            {item?.description && item?.description !== item?.name ? (
                              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{item.description}</div>
                            ) : null}
                          </div>
                          <div style={tableCell}>{item?.quantity ?? "-"}</div>
                          <div style={tableCell}>{item?.uom || "-"}</div>
                          <div style={tableCell}>{formatCurrency(unitPrice, portalOrderPreview.currency)}</div>
                          <div style={tableCell}>{formatCurrency(lineTotal, portalOrderPreview.currency)}</div>
                        </div>
                      );
                    })}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        padding: 16,
                        borderTop: "1px solid #dbe4ee",
                        background: "#f8fbff",
                      }}
                    >
                      <div style={{ minWidth: 240, display: "grid", gap: 8 }}>
                        <SummaryRow label="Subtotal" value={formatCurrency(portalOrderPreview.subtotal, portalOrderPreview.currency)} />
                        <SummaryRow label="Currency" value={portalOrderPreview.currency} />
                      </div>
                    </div>
                  </div>

                  <details
                    style={{
                      border: "1px solid #dbe4ee",
                      borderRadius: 12,
                      background: "#fff",
                    }}
                  >
                    <summary
                      style={{
                        cursor: "pointer",
                        padding: "12px 14px",
                        fontSize: 12,
                        fontWeight: 800,
                        color: "#2563eb",
                        listStyle: "none",
                      }}
                    >
                      View raw JSON payload
                    </summary>
                    <pre
                      style={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        borderTop: "1px solid #dbe4ee",
                        padding: 14,
                        margin: 0,
                        color: "#334155",
                        fontSize: 12,
                        background: "#f8fafc",
                      }}
                    >
                      {JSON.stringify(safeJsonParse(structuredTextContent || rawText || ""), null, 2)}
                    </pre>
                  </details>
                </div>
              ) : (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    background: "#fff",
                    border: "1px solid #dbe4ee",
                    borderRadius: 12,
                    padding: 14,
                    margin: 0,
                  }}
                >
                  {(() => {
                    const parsed = safeJsonParse(structuredTextContent || rawText || "");
                    return parsed ? JSON.stringify(parsed, null, 2) : structuredTextContent || rawText || "No JSON content available.";
                  })()}
                </pre>
              )
            ) : (
              <TextViewer content={structuredTextContent || rawText || "Preview is text-only for this format. Download the original document for the native file view."} />
            )}
          </div>
        </div>
      ) : (
        <div style={{ height: "100%", display: "grid", gridTemplateRows: "44px 1fr" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              borderBottom: "1px solid #dbe4ee",
              background: "#fff",
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>
                {fileName || "Original Document"}
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                Native preview is not available yet for this file type in the current viewer.
              </div>
            </div>
            <a
              href={fileUrl || "#"}
              target="_blank"
              rel="noreferrer"
              style={{
                border: "1px solid #dbe4ee",
                background: fileUrl ? "#fff" : "#f8fafc",
                color: fileUrl ? "#0f172a" : "#94a3b8",
                borderRadius: 8,
                padding: "6px 10px",
                textDecoration: "none",
                fontSize: 12,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                pointerEvents: fileUrl ? "auto" : "none",
              }}
            >
              <FaDownload />
              Download
            </a>
          </div>
          <div
            style={{
              padding: 14,
              height: "100%",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              color: "#334155",
              fontSize: 13,
              background: "#fff",
            }}
          >
            {fileUrl ? (
              <iframe
                src={fileUrl}
                title={fileName || "Original Document"}
                style={{
                  width: "100%",
                  minHeight: 640,
                  border: "1px solid #dbe4ee",
                  borderRadius: 12,
                  background: "#fff",
                }}
              />
            ) : (
              structuredTextContent || rawText || "No preview content available for this file type."
            )}
          </div>
        </div>
      )}
    </div>
  );
}


function XmlTreeNodeView({
  node,
  selectedField,
  onStructuredValueSelect,
  normalizeExtractedValue,
}: {
  node: {
    id: string;
    tag: string;
    text: string;
    depth: number;
    children: Array<any>;
  };
  selectedField?: string | null;
  onStructuredValueSelect?: (fieldKey: string, value: string) => void;
  normalizeExtractedValue: (fieldKey: string | null | undefined, rawValue: string) => string;
}) {
  const hasChildren = node.children.length > 0;
  const summaryValue = node.text || "";
  const value = normalizeExtractedValue(selectedField, summaryValue);
  const label = node.text ? `<${node.tag}> ${node.text}` : `<${node.tag}>`;

  const lineRow = (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        width: "100%",
      }}
    >
      <span style={{ color: "#64748b", fontWeight: 700, minWidth: 40 }}>
        {String(node.depth).padStart(2, "0")}
      </span>
      <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>{label}</span>
      {selectedField && !hasChildren ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onStructuredValueSelect?.(selectedField, value);
          }}
          style={{
            border: "1px solid #bfdbfe",
            background: "#eff6ff",
            color: "#1d4ed8",
            borderRadius: 999,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Map value
        </button>
      ) : null}
    </div>
  );

  if (!hasChildren) {
    return (
      <button
        type="button"
        onClick={() => {
          if (selectedField) onStructuredValueSelect?.(selectedField, value);
        }}
        style={{
          textAlign: "left",
          border: "1px solid #e2e8f0",
          background: "#fff",
          borderRadius: 10,
          padding: "10px 12px",
          fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
          fontSize: 12,
          lineHeight: 1.55,
          color: "#0f172a",
          cursor: selectedField ? "pointer" : "default",
          boxShadow: "0 1px 0 rgba(15,23,42,0.02)",
        }}
        title={selectedField ? `Map this XML line to ${selectedField}` : "Select a field on the right first"}
      >
        {lineRow}
      </button>
    );
  }

  return (
    <details
      open={node.depth < 2}
      style={{
        border: "1px solid #dbe4ee",
        borderRadius: 12,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          listStyle: "none",
          cursor: "pointer",
          padding: "10px 12px",
          fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
          fontSize: 12,
          lineHeight: 1.55,
          color: "#0f172a",
        }}
      >
        {lineRow}
      </summary>
      <div style={{ display: "grid", gap: 8, padding: "0 12px 12px 24px" }}>
        {node.children.map((child) => (
          <XmlTreeNodeView
            key={child.id}
            node={child}
            selectedField={selectedField}
            onStructuredValueSelect={onStructuredValueSelect}
            normalizeExtractedValue={normalizeExtractedValue}
          />
        ))}
      </div>
    </details>
  );
}

function EmailMetaRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 10, alignItems: "start" }}>
      <div style={{ color: "#64748b", fontSize: 12, fontWeight: 700 }}>{label}</div>
      <div style={{ color: "#0f172a", fontSize: 13, wordBreak: "break-word" }}>{value || "-"}</div>
    </div>
  );
}

function formatCurrency(value: number, currency: string) {
  const safeValue = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeValue);
  } catch {
    return `${currency || "USD"} ${safeValue.toFixed(2)}`;
  }
}

const tableCell = {
  padding: "14px",
  fontSize: 13,
  color: "#334155",
  alignSelf: "stretch",
  display: "flex",
  alignItems: "center",
} as const;

function PreviewRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", wordBreak: "break-word" }}>
        {value || "-"}
      </div>
    </div>
  );
}

function PreviewCard({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid #dbe4ee",
        borderRadius: 14,
        background: "#fff",
        padding: 14,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: "#0f172a", marginTop: 8, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {value || "-"}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function ViewerPlaceholder({ text }: { text: string }) {
  return (
    <div
      style={{
        height: 500,
        display: "grid",
        placeItems: "center",
        color: "#64748b",
        fontSize: 14,
        background: "#fff",
      }}
    >
      {text}
    </div>
  );
}

function navBtn(disabled: boolean): React.CSSProperties {
  return {
    border: "1px solid #dbe4ee",
    background: disabled ? "#f8fafc" : "#fff",
    color: disabled ? "#94a3b8" : "#0f172a",
    borderRadius: 8,
    padding: "6px 10px",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 12,
    fontWeight: 700,
  };
}
