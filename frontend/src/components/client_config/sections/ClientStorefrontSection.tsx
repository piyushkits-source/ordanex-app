import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import { absoluteFileUrl } from "../../../api/apiClient";
import { apiFetch, parseApiError } from "utils/api";
import { uploadPortalFile } from "../../../api/fileStorageApi";
import { buildStorefrontPath, storefrontEnvironmentSlug, workspaceEnvironmentBadge } from "../../../utils/environment";
import { useAppScope } from "../../../context/AppScopeContext";

type Props = {
  client: any;
  onBanner: (text: string, type?: "success" | "error" | "info") => void;
};

type CatalogMediaItem = {
  kind: "image" | "video";
  url: string;
  label?: string | null;
  poster_url?: string | null;
};

type CatalogItem = {
  sku: string;
  name: string;
  description?: string | null;
  details?: string | null;
  category?: string | null;
  brand?: string | null;
  unit_price?: number | null;
  currency?: string | null;
  uom?: string | null;
  stock_status?: string | null;
  lead_time?: string | null;
  min_order_qty?: number | null;
  moq_uom?: string | null;
  payment_terms?: string | null;
  discount_mode?: string | null;
  discount_value?: number | null;
  tax_mode?: string | null;
  tax_value?: number | null;
  freight_mode?: string | null;
  freight_value?: number | null;
  octroi_mode?: string | null;
  octroi_value?: number | null;
  shipping_mode?: string | null;
  shipping_value?: number | null;
  supplier_name?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  media?: CatalogMediaItem[];
  specifications?: Record<string, string> | null;
  [key: string]: unknown;
};

const API = "/client-config";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_BYTES = 8 * 1024 * 1024;

function isImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name);
}

function isVideoFile(file: File) {
  return file.type.startsWith("video/") || /\.(mp4|webm|ogg|mov|m4v)$/i.test(file.name);
}

function normalizeApprovedBuyerEmails(value: any) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(
    new Set(
      value
        .map((item) =>
          String((typeof item === "string" ? item : item?.email) || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  );
}

function normalizeMethodCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

function normalizeCatalogKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeChargeMode(value: unknown) {
  const mode = String(value || "NONE").trim().toUpperCase();
  return mode === "PERCENT" || mode === "AMOUNT" ? mode : "NONE";
}

function chargeAmount(baseAmount: number, mode: unknown, rawValue: unknown) {
  const numericValue = parseNumber(rawValue) ?? 0;
  if (!numericValue) return 0;
  const normalizedMode = normalizeChargeMode(mode);
  if (normalizedMode === "PERCENT") {
    return (baseAmount * numericValue) / 100;
  }
  if (normalizedMode === "AMOUNT") {
    return numericValue;
  }
  return 0;
}

function catalogChargeSummary(item: CatalogItem) {
  return [
    ["Discount", item.discount_mode, item.discount_value],
    ["Tax", item.tax_mode, item.tax_value],
    ["Freight", item.freight_mode, item.freight_value],
    ["Octroi", item.octroi_mode, item.octroi_value],
    ["Shipping", item.shipping_mode, item.shipping_value],
  ]
    .map(([label, mode, value]) => {
      const normalizedMode = normalizeChargeMode(mode);
      const numericValue = parseNumber(value);
      if (normalizedMode === "NONE" || numericValue === null || numericValue === 0) return null;
      return normalizedMode === "PERCENT"
        ? `${label}: ${numericValue}%`
        : `${label}: ${numericValue}`;
    })
    .filter(Boolean) as string[];
}

function estimateCatalogTotal(item: CatalogItem, quantity = 1) {
  const subtotal = (parseNumber(item.unit_price) ?? 0) * Math.max(1, quantity);
  const discount = chargeAmount(subtotal, item.discount_mode, item.discount_value);
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const tax = chargeAmount(discountedSubtotal, item.tax_mode, item.tax_value);
  const freight = chargeAmount(discountedSubtotal, item.freight_mode, item.freight_value);
  const octroi = chargeAmount(discountedSubtotal, item.octroi_mode, item.octroi_value);
  const shipping = chargeAmount(discountedSubtotal, item.shipping_mode, item.shipping_value);
  return discountedSubtotal + tax + freight + octroi + shipping;
}

function parseRulesJson(value: string, label: string) {
  const text = value.trim();
  if (!text) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} must be a valid JSON array.`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array.`);
  }
  return parsed.filter((entry) => entry && typeof entry === "object");
}

function parseSpecifications(value: unknown) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, string>;
  }
  const text = String(value).trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {}
  const pairs = text
    .split(/\r?\n|;/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [rawKey, ...rest] = entry.split(":");
      return [rawKey?.trim(), rest.join(":").trim()] as const;
    })
    .filter(([key, val]) => key && val);
  if (!pairs.length) return null;
  return Object.fromEntries(pairs);
}

function normalizeMediaUrl(value: unknown): string | null {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^[a-zA-Z]:[\\/]/.test(text) || text.startsWith("\\\\")) return null;
  if (text.toLowerCase().startsWith("file://")) return null;
  if (text.includes("<file_id>") || text.includes("<") || text.includes(">")) return null;
  return text;
}

function specificationsToText(value: CatalogItem["specifications"]) {
  if (!value || typeof value !== "object") return "";
  return Object.entries(value)
    .map(([key, entry]) => `${key}: ${entry}`)
    .join("\n");
}

function parseMediaList(value: unknown): CatalogMediaItem[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") {
          const normalizedUrl = normalizeMediaUrl(entry);
          if (!normalizedUrl) return null;
          const lowered = normalizedUrl.toLowerCase();
          return {
            kind: lowered.endsWith(".mp4") || lowered.includes("video")
              ? ("video" as const)
              : ("image" as const),
            url: normalizedUrl,
          };
        }
        if (entry && typeof entry === "object" && typeof (entry as any).url === "string") {
          const normalizedUrl = normalizeMediaUrl((entry as any).url);
          if (!normalizedUrl) return null;
          const kind = String((entry as any).kind || "").toLowerCase() === "video" ? "video" : "image";
          return {
            kind,
            url: normalizedUrl,
            label: (entry as any).label ? String((entry as any).label) : null,
            poster_url: (entry as any).poster_url ? String((entry as any).poster_url) : null,
          } as CatalogMediaItem;
        }
        return null;
      })
      .filter(Boolean) as CatalogMediaItem[];
  }
  const text = String(value).trim();
  if (!text) return [];
  try {
    return parseMediaList(JSON.parse(text));
  } catch {}
  return text
    .split(/\r?\n|,/)
    .map((entry) => normalizeMediaUrl(entry))
    .filter(Boolean)
    .map((url) => ({
      kind: /\.(mp4|webm|ogg)$/i.test(url) ? ("video" as const) : ("image" as const),
      url: String(url),
    }));
}

function ensureCatalogItemMedia(item: CatalogItem) {
  const media = parseMediaList(item.media);
  const imageUrl = normalizeMediaUrl(item.image_url);
  const videoUrl = normalizeMediaUrl(item.video_url);
  if (imageUrl && !media.some((entry) => entry.kind === "image" && entry.url === imageUrl)) {
    media.unshift({ kind: "image", url: imageUrl });
  }
  if (videoUrl && !media.some((entry) => entry.kind === "video" && entry.url === videoUrl)) {
    media.push({ kind: "video", url: videoUrl });
  }
  return { ...item, image_url: imageUrl, video_url: videoUrl, media };
}

function previewMediaUrl(url?: string | null) {
  return absoluteFileUrl(url || "");
}

function mapCatalogRow(row: Record<string, unknown>, supplierName: string): CatalogItem | null {
  const entries = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeCatalogKey(key), value]),
  );
  const sku = String(
    entries.sku ||
      entries.material_code ||
      entries.item_code ||
      entries.product_code ||
      entries.product_sku ||
      "",
  ).trim();
  const name = String(
    entries.name ||
      entries.product_name ||
      entries.item_name ||
      entries.product ||
      entries.description ||
      "",
  ).trim();
  if (!sku || !name) return null;

  const imageUrl = normalizeMediaUrl(entries.image_url || entries.image || entries.product_image);
  const videoUrl = normalizeMediaUrl(entries.video_url || entries.video || entries.product_video);
  const media = parseMediaList(entries.media || entries.media_urls || entries.gallery_urls);
  if (imageUrl) media.unshift({ kind: "image", url: imageUrl });
  if (videoUrl) media.push({ kind: "video", url: videoUrl });

  return ensureCatalogItemMedia({
    sku,
    name,
    description: String(entries.description || "").trim() || null,
    details: String(entries.details || entries.long_description || "").trim() || null,
    category: String(entries.category || entries.product_category || "").trim() || null,
    brand: String(entries.brand || "").trim() || null,
    unit_price: parseNumber(entries.unit_price ?? entries.price ?? entries.rate) ?? 0,
    currency: String(entries.currency || "USD").trim() || "USD",
    uom: String(entries.uom || entries.unit_of_measure || "EA").trim() || "EA",
    stock_status: String(entries.stock_status || entries.inventory_status || "Available").trim() || "Available",
    lead_time: String(entries.lead_time || entries.lead_time_days || "").trim() || null,
    min_order_qty: parseNumber(entries.min_order_qty ?? entries.moq ?? entries.minimum_order_qty),
    moq_uom: String(entries.moq_uom || entries.min_order_uom || entries.uom || "").trim() || null,
    payment_terms: String(entries.payment_terms || "").trim() || null,
    discount_mode: normalizeChargeMode(entries.discount_mode),
    discount_value: parseNumber(entries.discount_value),
    tax_mode: normalizeChargeMode(entries.tax_mode),
    tax_value: parseNumber(entries.tax_value),
    freight_mode: normalizeChargeMode(entries.freight_mode),
    freight_value: parseNumber(entries.freight_value),
    octroi_mode: normalizeChargeMode(entries.octroi_mode),
    octroi_value: parseNumber(entries.octroi_value),
    shipping_mode: normalizeChargeMode(entries.shipping_mode),
    shipping_value: parseNumber(entries.shipping_value),
    supplier_name: supplierName,
    image_url: imageUrl,
    video_url: videoUrl,
    media,
    specifications: parseSpecifications(entries.specifications || entries.specs),
  });
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((entry) => entry.trim());
}

function parseCsvText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\uFEFF/g, ""))
    .filter((line) => line.trim().length > 0);
  if (!lines.length) return [] as Record<string, string>[];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

export default function ClientStorefrontSection({ client, onBanner }: Props) {
  const { scope } = useAppScope();
  const activeEnvironment = scope.environment || "PROD";
  const activeEnvironmentLabel = workspaceEnvironmentBadge(activeEnvironment);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalogImporting, setCatalogImporting] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaUploadNote, setMediaUploadNote] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [approvedBuyerEmails, setApprovedBuyerEmails] = useState<string[]>([]);
  const [approvedBuyerDraft, setApprovedBuyerDraft] = useState("");
  const [selectedCatalogSku, setSelectedCatalogSku] = useState("");
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState({
    storefront_title: "Buyer Portal",
    hero_headline:
      "Shop products, submit orders, track fulfillment, and keep buyers informed in one storefront.",
    hero_description:
      "Configure a storefront that supports ERP-integrated sellers and suppliers who manage commerce fully in Ordanex, while giving buyers a clear view of products, payment expectations, and order progress.",
    support_email: "hello@ordanex.ai",
    logo_url: "",
    accent_color: "#2563eb",
    banner_text: "",
    catalog_source_mode: "ERP_SYNCED",
    catalog_title: "Client Catalog",
    catalog_description:
      "Publish supplier products with descriptions, specifications, pricing, ordering rules, and product media.",
    catalog_json: "[]",
    seller_mode: "ERP_INTEGRATED",
    order_flow_mode: "ERP_ORCHESTRATED",
    buyer_tracking_mode: "LIVE_ERP",
    supplier_display_name: "",
    payments_enabled: "YES",
    payment_mode: "INVOICE_LATER",
    payment_provider_name: "Supplier Direct",
    payment_accepted_methods: "Bank transfer, Card, UPI",
    payment_terms: "Net 30",
    payment_link_url: "",
    payment_link_label: "Pay supplier",
    payment_instructions:
      "Collect payment directly with the supplier using the methods listed on the storefront.",
    payment_proof_instructions:
      "Ask buyers to share their transaction id, UTR number, or payment confirmation after they complete payment.",
    show_product_specs: "YES",
    show_inventory_status: "YES",
    show_checkout_promises: "YES",
    pricing_combine_defaults: "YES",
    pricing_buyer_rules_json: "[]",
    pricing_ship_to_rules_json: "[]",
  });

  const portalPath = useMemo(
    () => buildStorefrontPath(client?.client_id, activeEnvironment),
    [activeEnvironment, client?.client_id],
  );

  const catalogItems = useMemo(() => {
    try {
      const parsed = JSON.parse(form.catalog_json || "[]");
      if (!Array.isArray(parsed)) return [] as CatalogItem[];
      return parsed.map((entry) => ensureCatalogItemMedia(entry as CatalogItem));
    } catch {
      return [] as CatalogItem[];
    }
  }, [form.catalog_json]);

  const selectedCatalogItem = useMemo(
    () => catalogItems.find((item) => item.sku === selectedCatalogSku) || null,
    [catalogItems, selectedCatalogSku],
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.client_id]);

  useEffect(() => {
    if (!catalogItems.length) {
      setSelectedCatalogSku("");
      return;
    }
    if (!selectedCatalogSku || !catalogItems.some((item) => item.sku === selectedCatalogSku)) {
      setSelectedCatalogSku(catalogItems[0].sku);
    }
  }, [catalogItems, selectedCatalogSku]);

  async function load() {
    if (!client?.client_id) return;
    try {
      setLoading(true);
      const [accessRes, settingsRes] = await Promise.all([
        apiFetch(`${API}/buyer-storefront/${client.client_id}`),
        apiFetch(`${API}/buyer-storefront-settings/${client.client_id}`),
      ]);
      if (!accessRes.ok) throw new Error(await parseApiError(accessRes));
      if (!settingsRes.ok) throw new Error(await parseApiError(settingsRes));

      const access = await accessRes.json();
      const settingsPayload = await settingsRes.json();
      const settings = settingsPayload?.settings || {};
      const branding = settings.branding || {};
      const catalog = settings.catalog || {};
      const commerce = settings.commerce || {};
      const payments = settings.payments || {};
      const experience = settings.experience || {};
      const pricing = settings.pricing || {};
      const accessCfg = settings.access || {};
      const supplierName = client?.client_name || commerce.supplier_display_name || "";

      setEnabled(Boolean(access?.enabled));
      setApprovedBuyerEmails(normalizeApprovedBuyerEmails(accessCfg.approved_buyers));
      setApprovedBuyerDraft("");
      setForm({
        storefront_title: branding.storefront_title || "Buyer Portal",
        hero_headline:
          branding.hero_headline ||
          "Shop products, submit orders, track fulfillment, and keep buyers informed in one storefront.",
        hero_description:
          branding.hero_description ||
          "Configure a storefront that supports ERP-integrated sellers and suppliers who manage commerce fully in Ordanex, while giving buyers a clear view of products, payment expectations, and order progress.",
        support_email: branding.support_email || "hello@ordanex.ai",
        logo_url: branding.logo_url || "",
        accent_color: branding.accent_color || "#2563eb",
        banner_text: branding.banner_text || "",
        catalog_source_mode: String(catalog.source_mode || "ERP_SYNCED"),
        catalog_title: catalog.title || "Client Catalog",
        catalog_description:
          catalog.description ||
          "Publish supplier products with descriptions, specifications, pricing, ordering rules, and product media.",
        catalog_json: JSON.stringify(
          Array.isArray(catalog.items)
            ? catalog.items.map((entry: CatalogItem) =>
                ensureCatalogItemMedia({
                  ...entry,
                  supplier_name: supplierName || entry.supplier_name || "",
                }),
              )
            : [],
          null,
          2,
        ),
        seller_mode: String(commerce.seller_mode || "ERP_INTEGRATED"),
        order_flow_mode: String(commerce.order_flow_mode || "ERP_ORCHESTRATED"),
        buyer_tracking_mode: String(commerce.buyer_tracking_mode || "LIVE_ERP"),
        supplier_display_name: supplierName,
        payments_enabled: payments.enabled === false ? "NO" : "YES",
        payment_mode: String(payments.mode || "INVOICE_LATER"),
        payment_provider_name: payments.provider_name || "Supplier Direct",
        payment_accepted_methods: normalizeMethodCsv(
          Array.isArray(payments.accepted_methods)
            ? payments.accepted_methods.join(", ")
            : String(payments.accepted_methods || "Bank transfer, Card, UPI"),
        ),
        payment_terms: payments.payment_terms || "Net 30",
        payment_link_url: payments.payment_link_url || "",
        payment_link_label: payments.payment_link_label || "Pay supplier",
        payment_instructions:
          payments.instructions ||
          "Collect payment directly with the supplier using the methods listed on the storefront.",
        payment_proof_instructions:
          payments.proof_of_payment_instructions ||
          "Ask buyers to share their transaction id, UTR number, or payment confirmation after they complete payment.",
        show_product_specs: experience.show_product_specs === false ? "NO" : "YES",
        show_inventory_status: experience.show_inventory_status === false ? "NO" : "YES",
        show_checkout_promises: experience.show_checkout_promises === false ? "NO" : "YES",
        pricing_combine_defaults: pricing.combine_with_product_defaults === false ? "NO" : "YES",
        pricing_buyer_rules_json: JSON.stringify(Array.isArray(pricing.buyer_rules) ? pricing.buyer_rules : [], null, 2),
        pricing_ship_to_rules_json: JSON.stringify(Array.isArray(pricing.ship_to_rules) ? pricing.ship_to_rules : [], null, 2),
      });
    } catch (err: any) {
      onBanner(err?.message || "Failed to load storefront settings.", "error");
    } finally {
      setLoading(false);
    }
  }

  function addApprovedBuyer() {
    const email = approvedBuyerDraft.trim().toLowerCase();
    if (!email) return;
    setApprovedBuyerEmails((current) => (current.includes(email) ? current : [...current, email]));
    setApprovedBuyerDraft("");
  }

  function removeApprovedBuyer(email: string) {
    setApprovedBuyerEmails((current) => current.filter((item) => item !== email));
  }

  function updateCatalogItems(nextItems: CatalogItem[]) {
    const supplierName = client?.client_name || form.supplier_display_name || "Configured Supplier";
    setForm((prev) => ({
      ...prev,
      catalog_source_mode: "PLATFORM_MANAGED",
      catalog_json: JSON.stringify(
        nextItems.map((item) =>
          ensureCatalogItemMedia({
            ...item,
            supplier_name: supplierName,
          }),
        ),
        null,
        2,
      ),
    }));
  }

  function upsertSelectedCatalogItem(updater: (item: CatalogItem) => CatalogItem) {
    if (!selectedCatalogItem) return;
    const nextItems = catalogItems.map((item) =>
      item.sku === selectedCatalogItem.sku ? ensureCatalogItemMedia(updater(item)) : item,
    );
    updateCatalogItems(nextItems);
  }

  function addCatalogItem() {
    const timestamp = Date.now();
    const supplierName = client?.client_name || form.supplier_display_name || "Configured Supplier";
    const newItem = ensureCatalogItemMedia({
      sku: `SKU-${timestamp}`,
      name: "New Product",
      description: "",
      details: "",
      category: "",
      brand: "",
      unit_price: 0,
      currency: "USD",
      uom: "EA",
      stock_status: "Available",
      lead_time: "",
      min_order_qty: 1,
      moq_uom: "EA",
      payment_terms: form.payment_terms || "",
      discount_mode: "NONE",
      discount_value: null,
      tax_mode: "NONE",
      tax_value: null,
      freight_mode: "NONE",
      freight_value: null,
      octroi_mode: "NONE",
      octroi_value: null,
      shipping_mode: "NONE",
      shipping_value: null,
      supplier_name: supplierName,
      media: [],
      specifications: null,
    });
    const nextItems = [...catalogItems, newItem];
    updateCatalogItems(nextItems);
    setSelectedCatalogSku(newItem.sku);
    onBanner("New catalog product added. Update its details and save storefront settings.", "info");
  }

  function removeSelectedCatalogItem() {
    if (!selectedCatalogItem) return;
    const nextItems = catalogItems.filter((item) => item.sku !== selectedCatalogItem.sku);
    updateCatalogItems(nextItems);
    setSelectedCatalogSku(nextItems[0]?.sku || "");
    onBanner(`${selectedCatalogItem.name} removed from the storefront catalog.`, "info");
  }

  async function importCatalogFile(file: File) {
    try {
      setCatalogImporting(true);
      let rows: Record<string, unknown>[] = [];
      if (/\.csv$/i.test(file.name)) {
        const text = await file.text();
        rows = parseCsvText(text);
      } else if (/\.xlsx?$/.test(file.name)) {
        try {
          const XLSX = await import("xlsx");
          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) throw new Error("The uploaded workbook does not contain any sheets.");
          const sheet = workbook.Sheets[firstSheetName];
          rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        } catch {
          throw new Error("Excel import needs the xlsx package in this frontend runtime. Use CSV for now or add xlsx to the app.");
        }
      } else {
        throw new Error("Unsupported file format. Use CSV, XLS, or XLSX.");
      }
      const supplierName = client?.client_name || form.supplier_display_name || "Configured Supplier";
      const catalog = rows.map((row) => mapCatalogRow(row, supplierName)).filter(Boolean) as CatalogItem[];
      if (!catalog.length) {
        throw new Error("No valid catalog rows found. Include at least SKU and Name columns.");
      }
      updateCatalogItems(catalog);
      onBanner(`${catalog.length} catalog item(s) imported from ${file.name}.`, "success");
    } catch (err: any) {
      onBanner(err?.message || "Failed to import catalog file.", "error");
    } finally {
      setCatalogImporting(false);
    }
  }

  async function downloadCatalogTemplate() {
    try {
      const res = await apiFetch(`${API}/storefront/catalog-template`);
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "ordanex-storefront-catalog-template.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      onBanner("Storefront catalog template downloaded. Keep row 1 unchanged and enter products from row 2 onward.", "success");
    } catch (err: any) {
      onBanner(err?.message || "Failed to download the storefront template.", "error");
    }
  }

  function openMediaPicker() {
    if (!selectedCatalogItem) {
      const message = "Add or import a product first, then select it before uploading image or video files.";
      setMediaUploadNote({ type: "info", text: message });
      onBanner(message, "info");
      return;
    }
    setMediaUploadNote({ type: "info", text: `Select one or more files for ${selectedCatalogItem.name}.` });
    mediaInputRef.current?.click();
  }

  async function handleMediaUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.currentTarget.value = "";
    if (!files.length || !selectedCatalogItem) return;
    try {
      setMediaUploading(true);
      setMediaUploadNote({ type: "info", text: `Uploading ${files.length} file(s) for ${selectedCatalogItem.name}...` });
      const uploaded: CatalogMediaItem[] = [];
      for (const file of files) {
        const isImage = isImageFile(file);
        const isVideo = isVideoFile(file);
        if (!isImage && !isVideo) {
          throw new Error(`Unsupported media type for ${file.name}. Use images or videos only.`);
        }
        const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
        if (file.size > maxBytes) {
          const sizeLabel = isVideo ? "8MB" : "2MB";
          throw new Error(`${file.name} is larger than ${sizeLabel}. Use a hosted URL in the catalog for larger assets.`);
        }
        const uploadedFile = await uploadPortalFile({
          file,
          clientId: client?.client_id || null,
          productSku: selectedCatalogItem.sku,
          scope: "catalog-media",
        });
        uploaded.push({
          kind: isVideo ? "video" : "image",
          url: uploadedFile.fileUrl || uploadedFile.fileDataUrl || "",
          label: uploadedFile.fileName || file.name,
        });
      }

      const nextItems = catalogItems.map((item) => {
        if (item.sku !== selectedCatalogItem.sku) return item;
        const existing = parseMediaList(item.media);
        const combined = [...existing, ...uploaded];
        const firstImage = combined.find((entry) => entry.kind === "image")?.url || item.image_url || null;
        const firstVideo = combined.find((entry) => entry.kind === "video")?.url || item.video_url || null;
        return ensureCatalogItemMedia({
          ...item,
          media: combined,
          image_url: firstImage,
          video_url: firstVideo,
        });
      });
      updateCatalogItems(nextItems);
      const firstUploadedUrl = uploaded[0]?.url;
      const successMessage =
        firstUploadedUrl
          ? `${uploaded.length} media file(s) added to ${selectedCatalogItem.name}. Primary URL: ${firstUploadedUrl}`
          : `${uploaded.length} media file(s) added to ${selectedCatalogItem.name}.`;
      setMediaUploadNote({ type: "success", text: successMessage });
      onBanner(
        successMessage,
        "success",
      );
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to add product media.";
      setMediaUploadNote({ type: "error", text: errorMessage });
      onBanner(errorMessage, "error");
    } finally {
      setMediaUploading(false);
    }
  }

  function removeMediaItem(url: string) {
    if (!selectedCatalogItem) return;
    const nextItems = catalogItems.map((item) => {
      if (item.sku !== selectedCatalogItem.sku) return item;
      const remaining = parseMediaList(item.media).filter((entry) => entry.url !== url);
      const imageUrl = remaining.find((entry) => entry.kind === "image")?.url || null;
      const videoUrl = remaining.find((entry) => entry.kind === "video")?.url || null;
      return ensureCatalogItemMedia({
        ...item,
        media: remaining,
        image_url: imageUrl,
        video_url: videoUrl,
      });
    });
    updateCatalogItems(nextItems);
  }

  async function save() {
    if (!client?.client_id) return;
    try {
      setSaving(true);
      const supplierName = client?.client_name || form.supplier_display_name || "";
      const payload = {
        branding: {
          storefront_title: form.storefront_title,
          hero_headline: form.hero_headline,
          hero_description: form.hero_description,
          support_email: form.support_email,
          logo_url: form.logo_url,
          accent_color: form.accent_color,
          banner_text: form.banner_text,
        },
        catalog: {
          source_mode: form.catalog_source_mode,
          title: form.catalog_title,
          description: form.catalog_description,
          items: (form.catalog_json.trim() ? JSON.parse(form.catalog_json) : []).map((entry: CatalogItem) =>
            ensureCatalogItemMedia({
              ...entry,
              supplier_name: supplierName,
            }),
          ),
        },
        commerce: {
          seller_mode: form.seller_mode,
          order_flow_mode: form.order_flow_mode,
          buyer_tracking_mode: form.buyer_tracking_mode,
          supplier_display_name: supplierName,
        },
        payments: {
          enabled: form.payments_enabled === "YES",
          mode: form.payment_mode,
          provider_name: form.payment_provider_name,
          accepted_methods: form.payment_accepted_methods
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          payment_terms: form.payment_terms,
          payment_link_url: form.payment_link_url,
          payment_link_label: form.payment_link_label,
          instructions: form.payment_instructions,
          proof_of_payment_instructions: form.payment_proof_instructions,
        },
        experience: {
          show_product_specs: form.show_product_specs === "YES",
          show_inventory_status: form.show_inventory_status === "YES",
          show_checkout_promises: form.show_checkout_promises === "YES",
        },
        pricing: {
          combine_with_product_defaults: form.pricing_combine_defaults === "YES",
          buyer_rules: parseRulesJson(form.pricing_buyer_rules_json, "Buyer pricing rules"),
          ship_to_rules: parseRulesJson(form.pricing_ship_to_rules_json, "Ship-to pricing rules"),
        },
        access: {
          approval_mode: "EMAIL_APPROVAL",
          approved_buyers: approvedBuyerEmails.map((email) => ({ email })),
        },
      };
      const res = await apiFetch(`${API}/buyer-storefront-settings/${client.client_id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      await load();
      onBanner("Storefront settings saved.", "success");
    } catch (err: any) {
      onBanner(err?.message || "Failed to save storefront settings.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAccess() {
    if (!client?.client_id) return;
    try {
      setSaving(true);
      const res = await apiFetch(`${API}/buyer-storefront/${client.client_id}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      setEnabled(Boolean(data?.enabled));
      onBanner(`Buyer storefront ${data?.enabled ? "enabled" : "disabled"}.`, "success");
    } catch (err: any) {
      onBanner(err?.message || "Failed to update storefront access.", "error");
    } finally {
      setSaving(false);
    }
  }

  function openPortal() {
    if (!portalPath) return;
    window.open(portalPath, "_blank", "noopener,noreferrer");
  }

  return (
    <div style={card}>
      <div style={titleRow}>
        <div>
          <div style={title}>Storefront</div>
          <div style={subtitle}>
            Configure a storefront that works for ERP-integrated suppliers and suppliers selling directly from Ordanex.
          </div>
          <div style={sharedBanner}>
            Storefront configuration is shared across staging and production. You are currently opening the {storefrontEnvironmentSlug(activeEnvironment)} buyer URL for {activeEnvironmentLabel} testing.
          </div>
        </div>
        <div style={actionsRow}>
          <button type="button" onClick={openPortal} disabled={!portalPath || loading} style={button}>
            Open storefront
          </button>
          <button type="button" onClick={toggleAccess} disabled={!client || saving} style={button}>
            {saving ? "Saving..." : enabled ? "Disable storefront" : "Enable storefront"}
          </button>
          <button type="button" onClick={save} disabled={!client || saving} style={buttonPrimary}>
            {saving ? "Saving..." : "Save storefront settings"}
          </button>
        </div>
      </div>

      <div style={statusRow}>
        <div style={statusCard}>
          <div style={label}>Access</div>
          <div style={value}>{loading ? "Loading..." : enabled ? "Enabled" : "Disabled"}</div>
        </div>
        <div style={statusCard}>
          <div style={label}>Portal path</div>
          <div style={value}>{portalPath || "-"}</div>
        </div>
        <div style={statusCard}>
          <div style={label}>Open storefront target</div>
          <div style={value}>{activeEnvironmentLabel}</div>
        </div>
        <div style={statusCard}>
          <div style={label}>Seller model</div>
          <div style={value}>{form.seller_mode === "STANDALONE_COMMERCE" ? "Supplier without ERP" : "ERP integrated"}</div>
        </div>
        <div style={statusCard}>
          <div style={label}>Payment mode</div>
          <div style={value}>
            {form.payment_mode === "PAYMENT_LINK"
              ? "Payment link"
              : form.payment_mode === "OFFLINE_TRANSFER"
                ? "Offline transfer"
                : "Invoice later"}
          </div>
        </div>
      </div>

      <div style={infoStrip}>
        <div style={infoChip}>ERP-integrated sellers can sync catalog and buyer tracking from ERP.</div>
        <div style={infoChip}>Standalone sellers use the client record as the supplier profile and manage catalog, payment instructions, fulfillment, and product media in Ordanex.</div>
      </div>

      <div style={grid}>
        <div style={fieldCard}>
          <div style={fieldLabel}>Storefront title</div>
          <input style={input} value={form.storefront_title} onChange={(e) => setForm((prev) => ({ ...prev, storefront_title: e.target.value }))} />
        </div>
        <div style={fieldCard}>
          <div style={fieldLabel}>Support email</div>
          <input style={input} value={form.support_email} onChange={(e) => setForm((prev) => ({ ...prev, support_email: e.target.value }))} />
        </div>
        <div style={fieldCard}>
          <div style={fieldLabel}>Seller operating model</div>
          <select style={input} value={form.seller_mode} onChange={(e) => setForm((prev) => ({ ...prev, seller_mode: e.target.value }))}>
            <option value="ERP_INTEGRATED">ERP integrated supplier</option>
            <option value="STANDALONE_COMMERCE">Supplier without ERP</option>
          </select>
        </div>
        <div style={fieldCard}>
          <div style={fieldLabel}>Seller / supplier name</div>
          <div style={helper}>Managed from Client Master because the client and supplier are the same for portal-managed commerce.</div>
          <input
            style={{ ...input, background: "#f8fafc", color: "#475569", cursor: "not-allowed" }}
            value={client?.client_name || form.supplier_display_name}
            readOnly
          />
        </div>
        <div style={fieldCard}>
          <div style={fieldLabel}>Order flow</div>
          <select style={input} value={form.order_flow_mode} onChange={(e) => setForm((prev) => ({ ...prev, order_flow_mode: e.target.value }))}>
            <option value="ERP_ORCHESTRATED">Create downstream ERP documents</option>
            <option value="ORDANEX_MANAGED">Manage order lifecycle in Ordanex</option>
          </select>
        </div>
        <div style={fieldCard}>
          <div style={fieldLabel}>Buyer tracking</div>
          <select style={input} value={form.buyer_tracking_mode} onChange={(e) => setForm((prev) => ({ ...prev, buyer_tracking_mode: e.target.value }))}>
            <option value="LIVE_ERP">Live ERP / fulfillment tracking</option>
            <option value="PORTAL_UPDATES">Portal-based lifecycle updates</option>
          </select>
        </div>
        <div style={wideFieldCard}>
          <div style={fieldLabel}>Hero headline</div>
          <textarea
            style={{ ...input, minHeight: 92, resize: "vertical" }}
            value={form.hero_headline}
            onChange={(e) => setForm((prev) => ({ ...prev, hero_headline: e.target.value }))}
          />
        </div>
        <div style={wideFieldCard}>
          <div style={fieldLabel}>Hero description</div>
          <textarea
            style={{ ...input, minHeight: 104, resize: "vertical" }}
            value={form.hero_description}
            onChange={(e) => setForm((prev) => ({ ...prev, hero_description: e.target.value }))}
          />
        </div>
        <div style={fieldCard}>
          <div style={fieldLabel}>Catalog source</div>
          <select style={input} value={form.catalog_source_mode} onChange={(e) => setForm((prev) => ({ ...prev, catalog_source_mode: e.target.value }))}>
            <option value="ERP_SYNCED">ERP-synced catalog</option>
            <option value="PLATFORM_MANAGED">Platform-managed catalog</option>
          </select>
        </div>
        <div style={fieldCard}>
          <div style={fieldLabel}>Catalog title</div>
          <input style={input} value={form.catalog_title} onChange={(e) => setForm((prev) => ({ ...prev, catalog_title: e.target.value }))} />
        </div>
        <div style={wideFieldCard}>
          <div style={fieldLabel}>Catalog description</div>
          <textarea
            style={{ ...input, minHeight: 84, resize: "vertical" }}
            value={form.catalog_description}
            onChange={(e) => setForm((prev) => ({ ...prev, catalog_description: e.target.value }))}
          />
        </div>
        <div style={fieldCard}>
          <div style={fieldLabel}>Payments enabled</div>
          <select style={input} value={form.payments_enabled} onChange={(e) => setForm((prev) => ({ ...prev, payments_enabled: e.target.value }))}>
            <option value="YES">Yes</option>
            <option value="NO">No</option>
          </select>
        </div>
        <div style={fieldCard}>
          <div style={fieldLabel}>Payment mode</div>
          <select style={input} value={form.payment_mode} onChange={(e) => setForm((prev) => ({ ...prev, payment_mode: e.target.value }))}>
            <option value="INVOICE_LATER">Invoice later</option>
            <option value="OFFLINE_TRANSFER">Offline transfer</option>
            <option value="PAYMENT_LINK">Payment link</option>
          </select>
        </div>
        <div style={fieldCard}>
          <div style={fieldLabel}>Payment provider label</div>
          <input
            style={input}
            value={form.payment_provider_name}
            onChange={(e) => setForm((prev) => ({ ...prev, payment_provider_name: e.target.value }))}
            placeholder="Supplier Direct / Razorpay / Stripe"
          />
        </div>
        <div style={fieldCard}>
          <div style={fieldLabel}>Payment terms</div>
          <input
            style={input}
            value={form.payment_terms}
            onChange={(e) => setForm((prev) => ({ ...prev, payment_terms: e.target.value }))}
            placeholder="Net 30 / Advance payment / COD"
          />
        </div>
        <div style={fieldCard}>
          <div style={fieldLabel}>Payment link URL</div>
          <input
            style={input}
            value={form.payment_link_url}
            onChange={(e) => setForm((prev) => ({ ...prev, payment_link_url: e.target.value }))}
            placeholder="https://payments.example.com/checkout"
          />
        </div>
        <div style={fieldCard}>
          <div style={fieldLabel}>Payment link label</div>
          <input
            style={input}
            value={form.payment_link_label}
            onChange={(e) => setForm((prev) => ({ ...prev, payment_link_label: e.target.value }))}
            placeholder="Pay supplier"
          />
        </div>
        <div style={wideFieldCard}>
          <div style={fieldLabel}>Accepted payment methods</div>
          <input
            style={input}
            value={form.payment_accepted_methods}
            onChange={(e) => setForm((prev) => ({ ...prev, payment_accepted_methods: e.target.value }))}
            placeholder="Bank transfer, Card, UPI"
          />
        </div>
        <div style={wideFieldCard}>
          <div style={fieldLabel}>Proof of payment instructions</div>
          <textarea
            style={{ ...input, minHeight: 88, resize: "vertical" }}
            value={form.payment_proof_instructions}
            onChange={(e) => setForm((prev) => ({ ...prev, payment_proof_instructions: e.target.value }))}
          />
        </div>
        <div style={wideFieldCard}>
          <div style={fieldLabel}>Payment instructions</div>
          <textarea
            style={{ ...input, minHeight: 96, resize: "vertical" }}
            value={form.payment_instructions}
            onChange={(e) => setForm((prev) => ({ ...prev, payment_instructions: e.target.value }))}
          />
        </div>
        <div style={fieldCard}>
          <div style={fieldLabel}>Show product specifications</div>
          <select style={input} value={form.show_product_specs} onChange={(e) => setForm((prev) => ({ ...prev, show_product_specs: e.target.value }))}>
            <option value="YES">Yes</option>
            <option value="NO">No</option>
          </select>
        </div>
        <div style={fieldCard}>
          <div style={fieldLabel}>Show inventory & lead times</div>
          <select style={input} value={form.show_inventory_status} onChange={(e) => setForm((prev) => ({ ...prev, show_inventory_status: e.target.value }))}>
            <option value="YES">Yes</option>
            <option value="NO">No</option>
          </select>
        </div>
        <div style={fieldCard}>
          <div style={fieldLabel}>Show checkout promises</div>
          <select style={input} value={form.show_checkout_promises} onChange={(e) => setForm((prev) => ({ ...prev, show_checkout_promises: e.target.value }))}>
            <option value="YES">Yes</option>
            <option value="NO">No</option>
          </select>
        </div>

        <div style={wideFieldCard}>
          <div style={fieldLabel}>Checkout pricing behavior</div>
          <div style={helper}>
            Keep product charges as defaults, then optionally override them by buyer, company, sold-to, ship-to, address, SKU, category, or brand.
          </div>
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            <div>
              <div style={fieldLabel}>Combine buyer rules with product defaults</div>
              <select
                style={input}
                value={form.pricing_combine_defaults}
                onChange={(e) => setForm((prev) => ({ ...prev, pricing_combine_defaults: e.target.value }))}
              >
                <option value="YES">Yes</option>
                <option value="NO">No</option>
              </select>
            </div>
            <div>
              <div style={fieldLabel}>Buyer pricing rules (JSON array)</div>
              <div style={helper}>
                Match using buyer_email, company_name_contains, sold_to_contains, sku, category, or brand. Rule values override product defaults when matched.
              </div>
              <textarea
                style={{
                  ...input,
                  minHeight: 132,
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                  resize: "vertical",
                }}
                value={form.pricing_buyer_rules_json}
                onChange={(e) => setForm((prev) => ({ ...prev, pricing_buyer_rules_json: e.target.value }))}
              />
            </div>
            <div>
              <div style={fieldLabel}>Ship-to pricing rules (JSON array)</div>
              <div style={helper}>
                Match using ship_to_contains, ship_to_address_contains, and optionally sku, category, or brand. Use this for region, tax, freight, octroi, shipping, or discount differences.
              </div>
              <textarea
                style={{
                  ...input,
                  minHeight: 132,
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                  resize: "vertical",
                }}
                value={form.pricing_ship_to_rules_json}
                onChange={(e) => setForm((prev) => ({ ...prev, pricing_ship_to_rules_json: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <div style={wideFieldCard}>
          <div style={splitHeader}>
            <div>
              <div style={fieldLabel}>Catalog JSON</div>
              <div style={helper}>
                Each item can include `image_url`, `video_url`, and a `media` array. Import files can also use `media_urls`. If you upload assets in Ordanex, reuse the returned file URL pattern like `/files/&lt;file_id&gt;/download`.
              </div>
            </div>
            <div style={inlineActions}>
              <label style={button}>
                {catalogImporting ? "Importing..." : "Import Excel / CSV"}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: "none" }}
                  disabled={catalogImporting}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importCatalogFile(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <button type="button" onClick={() => void downloadCatalogTemplate()} style={button}>
                Download template
              </button>
            </div>
          </div>
          <textarea
            style={{
              ...input,
              minHeight: 220,
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
              resize: "vertical",
            }}
            value={form.catalog_json}
            onChange={(e) => setForm((prev) => ({ ...prev, catalog_json: e.target.value }))}
          />
        </div>

        <div style={wideFieldCard}>
          <div style={splitHeader}>
            <div>
              <div style={fieldLabel}>Product media manager</div>
              <div style={helper}>
                Suppliers can add product images and short videos directly here. After upload, copy the generated Ordanex file URL into `image_url`, `video_url`, or `media_urls` when you want the same asset referenced in imports or JSON. Large media can use externally hosted HTTPS URLs instead.
              </div>
            </div>
            <div style={inlineActions}>
              <button
                type="button"
                onClick={openMediaPicker}
                style={button}
                disabled={mediaUploading}
              >
                {mediaUploading ? "Uploading..." : selectedCatalogItem ? "Upload image / video" : "Select a product to upload"}
              </button>
              <input
                ref={mediaInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                hidden
                disabled={mediaUploading}
                onChange={handleMediaUpload}
              />
            </div>
          </div>

          <div style={mediaManagerGrid}>
            <div style={mediaManagerPanel}>
              <div style={fieldLabel}>Select product</div>
              <select
                style={input}
                value={selectedCatalogSku}
                onChange={(e) => setSelectedCatalogSku(e.target.value)}
              >
                {catalogItems.length ? (
                  catalogItems.map((item) => (
                    <option key={item.sku} value={item.sku}>
                      {item.sku} - {item.name}
                    </option>
                  ))
                ) : (
                  <option value="">No catalog items loaded</option>
                )}
              </select>
              {!catalogItems.length ? (
                <div style={helper}>
                  Import the Excel or CSV template, or add a product manually below, before using the media upload action.
                </div>
              ) : null}
              <div style={mediaGuidanceBox}>
                <div style={guidanceTitle}>Supported ways to add media</div>
                <div style={helper}>1. Upload image/video files here for lightweight product media. Ordanex will generate a reusable URL like `/files/&lt;file_id&gt;/download`.</div>
                <div style={helper}>2. Paste that Ordanex URL into `image_url`, `video_url`, `media`, or `media_urls` if the asset should also appear in JSON imports, CSV, or Excel uploads.</div>
                <div style={helper}>3. If assets already live outside Ordanex, use a direct public `https://...` media URL instead.</div>
                <div style={helper}>4. Download the template, keep row 1 unchanged, and paste product data from row 2 onward.</div>
              </div>
              {mediaUploadNote ? (
                <div
                  style={{
                    ...mediaStatusBox,
                    borderColor:
                      mediaUploadNote.type === "error"
                        ? "#fecaca"
                        : mediaUploadNote.type === "success"
                          ? "#bbf7d0"
                          : "#c7d2fe",
                    background:
                      mediaUploadNote.type === "error"
                        ? "#fff1f2"
                        : mediaUploadNote.type === "success"
                          ? "#f0fdf4"
                          : "#eff6ff",
                    color:
                      mediaUploadNote.type === "error"
                        ? "#b91c1c"
                        : mediaUploadNote.type === "success"
                          ? "#166534"
                          : "#1d4ed8",
                  }}
                >
                  {mediaUploadNote.text}
                </div>
              ) : null}
            </div>

            <div style={mediaManagerPanel}>
              <div style={fieldLabel}>Selected product preview</div>
              {selectedCatalogItem ? (
                <div style={selectedProductCard}>
                  <div style={selectedProductTitle}>
                    <strong>{selectedCatalogItem.name}</strong>
                    <span style={skuPill}>{selectedCatalogItem.sku}</span>
                  </div>
                  <div style={helper}>
                    {selectedCatalogItem.category || "Uncategorized"} · {selectedCatalogItem.currency || "USD"} {selectedCatalogItem.unit_price ?? 0}
                  </div>
                  <div style={mediaList}>
                    {parseMediaList(selectedCatalogItem.media).length ? (
                      parseMediaList(selectedCatalogItem.media).map((entry) => (
                        <div key={entry.url} style={mediaRow}>
                          <div style={mediaPreviewFrame}>
                            {entry.kind === "image" ? (
                              <img src={previewMediaUrl(entry.url)} alt={entry.label || selectedCatalogItem.name} style={mediaImage} />
                            ) : (
                              <video src={previewMediaUrl(entry.url)} controls style={mediaVideo} />
                            )}
                          </div>
                          <div style={mediaMeta}>
                            <div style={mediaTypePill}>{entry.kind === "image" ? "Image" : "Video"}</div>
                            <div style={mediaLabel}>{entry.label || "Uploaded asset"}</div>
                            <div style={{ ...helper, wordBreak: "break-all" }}>
                              Use this URL in template or JSON: {entry.url}
                            </div>
                            <button type="button" onClick={() => removeMediaItem(entry.url)} style={linkButton}>
                              Remove
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={helper}>No media attached to this product yet.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={helper}>Import or add catalog items first, then select one product and attach product media.</div>
              )}
            </div>
          </div>
        </div>

        <div style={wideFieldCard}>
          <div style={splitHeader}>
            <div>
              <div style={fieldLabel}>Product editor</div>
              <div style={helper}>
                Manage storefront products directly here instead of editing raw JSON for every update.
              </div>
            </div>
            <div style={inlineActions}>
              <button type="button" onClick={addCatalogItem} style={button}>
                Add product
              </button>
              <button
                type="button"
                onClick={removeSelectedCatalogItem}
                style={linkButton}
                disabled={!selectedCatalogItem}
              >
                Remove selected
              </button>
            </div>
          </div>

          {selectedCatalogItem ? (
            <div style={productEditorGrid}>
              <div style={fieldCard}>
                <div style={fieldLabel}>SKU</div>
                <input
                  style={input}
                  value={selectedCatalogItem.sku}
                  onChange={(e) =>
                    upsertSelectedCatalogItem((item) => ({
                      ...item,
                      sku: e.target.value.trim() || item.sku,
                    }))
                  }
                />
              </div>
              <div style={fieldCard}>
                <div style={fieldLabel}>Product name</div>
                <input
                  style={input}
                  value={selectedCatalogItem.name}
                  onChange={(e) =>
                    upsertSelectedCatalogItem((item) => ({ ...item, name: e.target.value }))
                  }
                />
              </div>
              <div style={fieldCard}>
                <div style={fieldLabel}>Category</div>
                <input
                  style={input}
                  value={selectedCatalogItem.category || ""}
                  onChange={(e) =>
                    upsertSelectedCatalogItem((item) => ({ ...item, category: e.target.value }))
                  }
                />
              </div>
              <div style={fieldCard}>
                <div style={fieldLabel}>Brand</div>
                <input
                  style={input}
                  value={selectedCatalogItem.brand || ""}
                  onChange={(e) =>
                    upsertSelectedCatalogItem((item) => ({ ...item, brand: e.target.value }))
                  }
                />
              </div>
              <div style={fieldCard}>
                <div style={fieldLabel}>Unit price</div>
                <input
                  style={input}
                  type="number"
                  min="0"
                  step="0.01"
                  value={selectedCatalogItem.unit_price ?? 0}
                  onChange={(e) =>
                    upsertSelectedCatalogItem((item) => ({
                      ...item,
                      unit_price: parseNumber(e.target.value) ?? 0,
                    }))
                  }
                />
              </div>
              <div style={fieldCard}>
                <div style={fieldLabel}>Currency</div>
                <input
                  style={input}
                  value={selectedCatalogItem.currency || "USD"}
                  onChange={(e) =>
                    upsertSelectedCatalogItem((item) => ({
                      ...item,
                      currency: e.target.value.toUpperCase(),
                    }))
                  }
                />
              </div>
              <div style={fieldCard}>
                <div style={fieldLabel}>UOM</div>
                <input
                  style={input}
                  value={selectedCatalogItem.uom || "EA"}
                  onChange={(e) =>
                    upsertSelectedCatalogItem((item) => ({
                      ...item,
                      uom: e.target.value.toUpperCase(),
                    }))
                  }
                />
              </div>
              <div style={fieldCard}>
                <div style={fieldLabel}>Stock status</div>
                <input
                  style={input}
                  value={selectedCatalogItem.stock_status || ""}
                  onChange={(e) =>
                    upsertSelectedCatalogItem((item) => ({
                      ...item,
                      stock_status: e.target.value,
                    }))
                  }
                />
              </div>
              <div style={fieldCard}>
                <div style={fieldLabel}>Lead time</div>
                <input
                  style={input}
                  value={selectedCatalogItem.lead_time || ""}
                  onChange={(e) =>
                    upsertSelectedCatalogItem((item) => ({ ...item, lead_time: e.target.value }))
                  }
                />
              </div>
              <div style={fieldCard}>
                <div style={fieldLabel}>Minimum order quantity</div>
                <input
                  style={input}
                  type="number"
                  min="0"
                  step="1"
                  value={selectedCatalogItem.min_order_qty ?? ""}
                  onChange={(e) =>
                    upsertSelectedCatalogItem((item) => ({
                      ...item,
                      min_order_qty: parseNumber(e.target.value),
                    }))
                  }
                />
              </div>
              <div style={fieldCard}>
                <div style={fieldLabel}>MOQ UOM</div>
                <input
                  style={input}
                  value={selectedCatalogItem.moq_uom || ""}
                  onChange={(e) =>
                    upsertSelectedCatalogItem((item) => ({
                      ...item,
                      moq_uom: e.target.value.toUpperCase(),
                    }))
                  }
                />
              </div>
              <div style={fieldCard}>
                <div style={fieldLabel}>Payment terms</div>
                <input
                  style={input}
                  value={selectedCatalogItem.payment_terms || ""}
                  onChange={(e) =>
                    upsertSelectedCatalogItem((item) => ({
                      ...item,
                      payment_terms: e.target.value,
                    }))
                  }
                />
              </div>
              <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                {[
                  ["discount", "Discount"],
                  ["tax", "Tax"],
                  ["freight", "Freight"],
                  ["octroi", "Octroi"],
                  ["shipping", "Shipping"],
                ].map(([prefix, label]) => (
                  <div key={prefix} style={fieldCard}>
                    <div style={fieldLabel}>{label}</div>
                    <div style={{ display: "grid", gap: 10 }}>
                      <select
                        style={input}
                        value={String(selectedCatalogItem[`${prefix}_mode`] || "NONE")}
                        onChange={(e) =>
                          upsertSelectedCatalogItem((item) => ({
                            ...item,
                            [`${prefix}_mode`]: e.target.value,
                          }))
                        }
                      >
                        <option value="NONE">None</option>
                        <option value="PERCENT">Percent</option>
                        <option value="AMOUNT">Amount</option>
                      </select>
                      <input
                        style={input}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={String(selectedCatalogItem[`${prefix}_mode`] || "NONE") === "PERCENT" ? "Enter %" : "Enter amount"}
                        value={selectedCatalogItem[`${prefix}_value`] ?? ""}
                        onChange={(e) =>
                          upsertSelectedCatalogItem((item) => ({
                            ...item,
                            [`${prefix}_value`]: parseNumber(e.target.value),
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div style={wideFieldCard}>
                <div style={fieldLabel}>Short description</div>
                <textarea
                  style={{ ...input, minHeight: 90, resize: "vertical" }}
                  value={selectedCatalogItem.description || ""}
                  onChange={(e) =>
                    upsertSelectedCatalogItem((item) => ({
                      ...item,
                      description: e.target.value,
                    }))
                  }
                />
              </div>
              <div style={wideFieldCard}>
                <div style={fieldLabel}>Detailed description</div>
                <textarea
                  style={{ ...input, minHeight: 110, resize: "vertical" }}
                  value={selectedCatalogItem.details || ""}
                  onChange={(e) =>
                    upsertSelectedCatalogItem((item) => ({ ...item, details: e.target.value }))
                  }
                />
              </div>
              <div style={fieldCard}>
                <div style={fieldLabel}>Primary image URL</div>
                <div style={helper}>Paste an Ordanex upload URL like `/files/&lt;file_id&gt;/download` or a public HTTPS image URL.</div>
                <input
                  style={input}
                  placeholder="/files/<file_id>/download or https://media.yourdomain.com/catalog/sku-1001.jpg"
                  value={selectedCatalogItem.image_url || ""}
                  onChange={(e) =>
                    upsertSelectedCatalogItem((item) => ({
                      ...item,
                      image_url: e.target.value.trim() || null,
                    }))
                  }
                />
              </div>
              <div style={fieldCard}>
                <div style={fieldLabel}>Primary video URL</div>
                <div style={helper}>Paste an Ordanex upload URL or a public HTTPS MP4/WebM URL for the product demo.</div>
                <input
                  style={input}
                  placeholder="/files/<file_id>/download or https://media.yourdomain.com/catalog/sku-1001-demo.mp4"
                  value={selectedCatalogItem.video_url || ""}
                  onChange={(e) =>
                    upsertSelectedCatalogItem((item) => ({
                      ...item,
                      video_url: e.target.value.trim() || null,
                    }))
                  }
                />
              </div>
              <div style={wideFieldCard}>
                <div style={fieldLabel}>Specifications</div>
                <div style={helper}>Use one line per specification, for example `Color: Blue`.</div>
                <textarea
                  style={{ ...input, minHeight: 120, resize: "vertical" }}
                  value={specificationsToText(selectedCatalogItem.specifications)}
                  onChange={(e) =>
                    upsertSelectedCatalogItem((item) => ({
                      ...item,
                      specifications: parseSpecifications(e.target.value),
                    }))
                  }
                />
              </div>
            </div>
          ) : (
            <div style={helper}>Add a product to start building the storefront catalog.</div>
          )}
        </div>

        <div style={wideFieldCard}>
          <div style={splitHeader}>
            <div>
              <div style={fieldLabel}>Buyer-facing product preview</div>
              <div style={helper}>
                Preview how buyers will view product images, videos, descriptions, pricing, and checkout details in the storefront.
              </div>
            </div>
            <div style={previewBadge}>
              {form.catalog_source_mode === "PLATFORM_MANAGED" ? "Platform-managed catalog" : "ERP-synced catalog"}
            </div>
          </div>

          {catalogItems.length ? (
            <div style={previewGrid}>
              {catalogItems.slice(0, 3).map((item) => {
                const media = parseMediaList(item.media);
                const heroMedia = media[0] || (item.image_url ? { kind: "image" as const, url: item.image_url } : null);
                return (
                  <div key={item.sku} style={previewCard}>
                    <div style={previewMediaFrame}>
                      {heroMedia ? (
                        heroMedia.kind === "video" ? (
                          <video src={previewMediaUrl(heroMedia.url)} controls style={previewVideo} />
                        ) : (
                          <img src={previewMediaUrl(heroMedia.url)} alt={item.name} style={previewImage} />
                        )
                      ) : (
                        <div style={previewMediaEmpty}>No product media yet</div>
                      )}
                    </div>

                    <div style={previewBody}>
                      <div style={previewTopRow}>
                        <div>
                          <div style={previewCategory}>{item.category || "Client Catalog"}</div>
                          <div style={previewTitle}>{item.name}</div>
                        </div>
                        <div style={previewPrice}>
                          {(item.currency || "USD").toUpperCase()} {Number(item.unit_price ?? 0).toFixed(2)}
                        </div>
                      </div>

                      <div style={previewDescription}>
                        {item.description || item.details || "No product description added yet."}
                      </div>

                      <div style={previewChipRow}>
                        <div style={previewChip}>{item.stock_status || "Available"}</div>
                        {item.lead_time ? <div style={previewChip}>Lead time: {item.lead_time}</div> : null}
                        {item.payment_terms ? <div style={previewChip}>{item.payment_terms}</div> : null}
                        {catalogChargeSummary(item).map((entry) => (
                          <div key={entry} style={previewChip}>{entry}</div>
                        ))}
                      </div>

                      <div style={{ ...previewMetaGrid, marginTop: 2 }}>
                        <div style={previewMetaBlock}>
                          <div style={previewMetaLabel}>Estimated total</div>
                          <div style={previewMetaValue}>
                            {(item.currency || "USD").toUpperCase()} {estimateCatalogTotal(item, Number(item.min_order_qty || 1)).toFixed(2)}
                          </div>
                        </div>
                        <div style={previewMetaBlock}>
                          <div style={previewMetaLabel}>Estimate basis</div>
                          <div style={previewMetaValue}>
                            MOQ {item.min_order_qty ? `${item.min_order_qty} ${item.moq_uom || item.uom || ""}`.trim() : `1 ${item.uom || "EA"}`}
                          </div>
                        </div>
                      </div>

                      <div style={previewMetaGrid}>
                        <div style={previewMetaBlock}>
                          <div style={previewMetaLabel}>Supplier</div>
                          <div style={previewMetaValue}>{client?.client_name || item.supplier_name || "Configured supplier"}</div>
                        </div>
                        <div style={previewMetaBlock}>
                          <div style={previewMetaLabel}>MOQ</div>
                          <div style={previewMetaValue}>
                            {item.min_order_qty ? `${item.min_order_qty} ${item.moq_uom || item.uom || ""}`.trim() : "Not specified"}
                          </div>
                        </div>
                      </div>

                      {media.length > 1 ? (
                        <div style={previewThumbRow}>
                          {media.slice(0, 4).map((entry) => (
                            <div key={entry.url} style={previewThumb}>
                              {entry.kind === "video" ? (
                                <div style={previewVideoThumb}>Video</div>
                              ) : (
                                <img src={previewMediaUrl(entry.url)} alt={entry.label || item.name} style={previewThumbImage} />
                              )}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div style={previewActionRow}>
                        <button type="button" style={buttonPrimary}>
                          Add to cart
                        </button>
                        <div style={previewActionHint}>
                          Buyers can browse details, see media, and proceed with the configured payment journey.
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={helper}>Import catalog items first to generate the buyer-facing product previews.</div>
          )}
        </div>

        <div style={wideFieldCard}>
          <div style={fieldLabel}>Approved buyers</div>
          <div style={helper}>Only these buyer email addresses can access the storefront.</div>
          <div style={approvedBuyerComposer}>
            <input
              style={{ ...input, minWidth: 0, flex: "1 1 320px" }}
              value={approvedBuyerDraft}
              onChange={(e) => setApprovedBuyerDraft(e.target.value)}
              placeholder="buyer@company.com"
            />
            <button type="button" onClick={addApprovedBuyer} style={button}>
              Add approved buyer
            </button>
          </div>
          <div style={approvedBuyerList}>
            {approvedBuyerEmails.length ? (
              approvedBuyerEmails.map((email) => (
                <div key={email} style={buyerRow}>
                  <div style={buyerEmail}>{email}</div>
                  <button type="button" onClick={() => removeApprovedBuyer(email)} style={linkButton}>
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <div style={helper}>No approved buyers added yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const card: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  background: "linear-gradient(180deg, #fff 0%, #f8fbff 100%)",
  padding: 16,
  minWidth: 0,
};

const titleRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 16,
};

const actionsRow: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const title: CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: "#0f172a",
};

const subtitle: CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginTop: 4,
  maxWidth: 720,
  lineHeight: 1.6,
};

const button: CSSProperties = {
  border: "1px solid #dbe4ee",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 999,
  padding: "9px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const buttonPrimary: CSSProperties = {
  ...button,
  background: "#0b5fff",
  color: "#fff",
  borderColor: "#0b5fff",
};

const statusRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const statusCard: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  padding: 14,
  minWidth: 0,
};

const label: CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginBottom: 6,
};

const value: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#0f172a",
  overflowWrap: "anywhere",
};

const infoStrip: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 16,
};

const infoChip: CSSProperties = {
  border: "1px solid #dbe4ee",
  background: "#fff",
  color: "#334155",
  borderRadius: 999,
  padding: "8px 12px",
  fontSize: 12,
  lineHeight: 1.4,
};

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
  alignItems: "start",
};

const fieldCard: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  padding: 14,
  minWidth: 0,
  display: "grid",
  gridTemplateRows: "auto minmax(0, auto)",
  rowGap: 10,
  alignContent: "start",
  overflow: "hidden",
};

const wideFieldCard: CSSProperties = {
  ...fieldCard,
  gridColumn: "1 / -1",
};

const fieldLabel: CSSProperties = {
  fontSize: 12,
  color: "#475569",
  fontWeight: 700,
  marginBottom: 0,
};

const input: CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  border: "1px solid #dbe4ee",
  borderRadius: 10,
  padding: "10px 12px",
  minHeight: 42,
  fontSize: 13,
  lineHeight: 1.4,
  color: "#0f172a",
  outline: "none",
  background: "#fff",
  boxSizing: "border-box",
  display: "block",
  margin: 0,
  alignSelf: "stretch",
  appearance: "none",
  WebkitAppearance: "none",
};

const helper: CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  lineHeight: 1.5,
};

const approvedBuyerComposer: CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 8,
  flexWrap: "wrap",
  alignItems: "stretch",
};

const approvedBuyerList: CSSProperties = {
  display: "grid",
  gap: 8,
  marginTop: 12,
};

const buyerRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: "10px 12px",
  background: "#fff",
  flexWrap: "wrap",
};

const buyerEmail: CSSProperties = {
  fontWeight: 700,
  color: "#0f172a",
  overflowWrap: "anywhere",
};

const linkButton: CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fff",
  color: "#b91c1c",
  borderRadius: 999,
  padding: "7px 12px",
  cursor: "pointer",
  fontWeight: 700,
};

const splitHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const inlineActions: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const mediaManagerGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 12,
  alignItems: "start",
};

const mediaManagerPanel: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#f8fbff",
  padding: 12,
  display: "grid",
  gap: 10,
  minWidth: 0,
};

const mediaGuidanceBox: CSSProperties = {
  display: "grid",
  gap: 6,
  padding: 12,
  borderRadius: 12,
  background: "#fff",
  border: "1px solid #dbe4ee",
};

const mediaStatusBox: CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid #c7d2fe",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.5,
  overflowWrap: "anywhere",
};

const guidanceTitle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#0f172a",
};

const selectedProductCard: CSSProperties = {
  display: "grid",
  gap: 10,
};

const selectedProductTitle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const skuPill: CSSProperties = {
  borderRadius: 999,
  padding: "4px 8px",
  background: "#dbeafe",
  color: "#1d4ed8",
  fontSize: 11,
  fontWeight: 800,
};

const mediaList: CSSProperties = {
  display: "grid",
  gap: 10,
};

const mediaRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(120px, 180px) minmax(0, 1fr)",
  gap: 12,
  alignItems: "start",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 10,
  background: "#fff",
};

const mediaPreviewFrame: CSSProperties = {
  borderRadius: 10,
  overflow: "hidden",
  background: "#0f172a",
  minHeight: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const mediaImage: CSSProperties = {
  width: "100%",
  height: 120,
  objectFit: "cover",
  display: "block",
};

const mediaVideo: CSSProperties = {
  width: "100%",
  maxHeight: 160,
  display: "block",
  background: "#020617",
};

const mediaMeta: CSSProperties = {
  display: "grid",
  gap: 8,
  minWidth: 0,
};

const mediaTypePill: CSSProperties = {
  display: "inline-flex",
  width: "fit-content",
  borderRadius: 999,
  padding: "4px 8px",
  background: "#eef2ff",
  color: "#4338ca",
  fontSize: 11,
  fontWeight: 800,
};

const mediaLabel: CSSProperties = {
  fontSize: 12,
  color: "#334155",
  overflowWrap: "anywhere",
};

const previewBadge: CSSProperties = {
  borderRadius: 999,
  padding: "6px 10px",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontSize: 12,
  fontWeight: 800,
};

const previewGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 14,
};

const previewCard: CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: 18,
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  overflow: "hidden",
  display: "grid",
  minWidth: 0,
};

const previewMediaFrame: CSSProperties = {
  background: "linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)",
  minHeight: 220,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const previewImage: CSSProperties = {
  width: "100%",
  height: 220,
  objectFit: "cover",
  display: "block",
};

const previewVideo: CSSProperties = {
  width: "100%",
  maxHeight: 260,
  display: "block",
  background: "#0f172a",
};

const previewMediaEmpty: CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  fontWeight: 700,
};

const previewBody: CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 16,
};

const previewTopRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
};

const previewCategory: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 0.3,
  color: "#2563eb",
  marginBottom: 4,
};

const previewTitle: CSSProperties = {
  fontSize: 18,
  lineHeight: 1.2,
  fontWeight: 800,
  color: "#0f172a",
};

const previewPrice: CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  color: "#0f172a",
  whiteSpace: "nowrap",
};

const previewDescription: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
  color: "#475569",
};

const previewChipRow: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const previewChip: CSSProperties = {
  borderRadius: 999,
  padding: "6px 10px",
  background: "#eef2ff",
  color: "#1e3a8a",
  fontSize: 11,
  fontWeight: 800,
};

const previewMetaGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const previewMetaBlock: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 10,
  background: "#fff",
};

const previewMetaLabel: CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  fontWeight: 700,
  marginBottom: 4,
};

const previewMetaValue: CSSProperties = {
  fontSize: 13,
  color: "#0f172a",
  fontWeight: 700,
  overflowWrap: "anywhere",
};

const previewThumbRow: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const previewThumb: CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 10,
  overflow: "hidden",
  border: "1px solid #dbe4ee",
  background: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const previewThumbImage: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const previewVideoThumb: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "#1d4ed8",
};

const previewActionRow: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const previewActionHint: CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  lineHeight: 1.5,
  flex: "1 1 220px",
};

const sharedBanner: CSSProperties = {
  marginTop: 10,
  borderRadius: 12,
  border: "1px solid #c7d2fe",
  background: "#eff6ff",
  color: "#1d4ed8",
  padding: "10px 12px",
  fontSize: 12,
  lineHeight: 1.6,
  fontWeight: 700,
  maxWidth: 760,
};

const productEditorGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
  alignItems: "start",
};
