import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getAuth, getPostLoginPath } from "../utils/auth";
import {
  fetchBuyerAccess,
  fetchBuyerCatalog,
  fetchBuyerOrder,
  fetchBuyerOrders,
  fetchBuyerPortalSettings,
  previewBuyerPricing,
  submitBuyerOrder,
  type BuyerPortalCatalogItem,
  type BuyerPortalChargeRule,
  type BuyerPortalMediaItem,
  type BuyerPortalOrder,
  type BuyerPortalOrderItem,
  type BuyerPortalPricingSettings,
  type BuyerPortalSettings,
} from "../api/buyerPortalApi";
import { absoluteFileUrl } from "../api/apiClient";
import { uploadPortalFile } from "../api/fileStorageApi";

type Props = {
  clientId?: string;
};

type CartLine = BuyerPortalCatalogItem & { quantity: number };

type TrackingStep = {
  key: string;
  label: string;
  status: "complete" | "active" | "pending";
  detail: string;
};

const MAX_PAYMENT_PROOF_BYTES = 4 * 1024 * 1024;
const LEGACY_PAYMENT_GUIDANCE = "Collect payment directly with the supplier using the methods listed on the storefront.";
const DEFAULT_PAYMENT_GUIDANCE = "Make payment directly to the supplier using the methods listed on the storefront.";
const INVOICE_ISSUED_PAYMENT_STATUS = "Invoice issued - awaiting buyer payment";

function normalizePaymentGuidanceText(value?: string | null) {
  const text = String(value || "").trim();
  if (!text || text === LEGACY_PAYMENT_GUIDANCE) return DEFAULT_PAYMENT_GUIDANCE;
  return text;
}

function normalizeBuyerPaymentStatus(value?: string | null, hasInvoice = false) {
  const text = String(value || "").trim();
  if ((!text || text === "Awaiting supplier invoice") && hasInvoice) {
    return INVOICE_ISSUED_PAYMENT_STATUS;
  }
  return text;
}

function resolveClientId(explicitClientId?: string) {
  if (explicitClientId) return explicitClientId;
  if (typeof window === "undefined") return "";
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

function resolvePortalEnvironment(_explicitEnvironment?: string) {
  return "production";
}

function buyerAccessStorageKey(clientId: string, environment: string) {
  return `ordanex_buyer_access_${environment}_${clientId}`;
}

function money(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function normalizeChargeMode(value?: string | null) {
  const mode = String(value || "NONE").trim().toUpperCase();
  return mode === "PERCENT" || mode === "AMOUNT" ? mode : "NONE";
}

function chargeAmount(baseAmount: number, mode?: string | null, rawValue?: number | null) {
  const numericValue = Number(rawValue || 0);
  if (!numericValue) return 0;
  const normalizedMode = normalizeChargeMode(mode);
  if (normalizedMode === "PERCENT") return (baseAmount * numericValue) / 100;
  if (normalizedMode === "AMOUNT") return numericValue;
  return 0;
}

function computeCatalogPricing(item: BuyerPortalCatalogItem, quantity = 1) {
  const subtotal = (Number(item.unit_price) || 0) * Math.max(1, Number(quantity || 1));
  const discount = chargeAmount(subtotal, item.discount_mode, item.discount_value);
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const tax = chargeAmount(discountedSubtotal, item.tax_mode, item.tax_value);
  const freight = chargeAmount(discountedSubtotal, item.freight_mode, item.freight_value);
  const octroi = chargeAmount(discountedSubtotal, item.octroi_mode, item.octroi_value);
  const shipping = chargeAmount(discountedSubtotal, item.shipping_mode, item.shipping_value);
  return {
    subtotal,
    discount,
    tax,
    freight,
    octroi,
    shipping,
    total: discountedSubtotal + tax + freight + octroi + shipping,
  };
}

function summarizeCatalogCharges(item: BuyerPortalCatalogItem) {
  return [
    ["Discount", item.discount_mode, item.discount_value],
    ["Tax", item.tax_mode, item.tax_value],
    ["Freight", item.freight_mode, item.freight_value],
    ["Octroi", item.octroi_mode, item.octroi_value],
    ["Shipping", item.shipping_mode, item.shipping_value],
  ]
    .map(([label, mode, value]) => {
      const normalizedMode = normalizeChargeMode(String(mode || ""));
      const numericValue = Number(value || 0);
      if (normalizedMode === "NONE" || !numericValue) return null;
      return normalizedMode === "PERCENT" ? `${label}: ${numericValue}%` : `${label}: ${numericValue}`;
    })
    .filter(Boolean) as string[];
}

type PricingRuleContext = {
  buyerEmail: string;
  companyName: string;
  soldTo: string;
  shipTo: string;
  shipToAddress: string;
};

function matchesRuleText(ruleValue?: string | null, actualValue?: string | null) {
  const expected = String(ruleValue || "").trim().toLowerCase();
  if (!expected) return true;
  return String(actualValue || "").trim().toLowerCase().includes(expected);
}

function matchesChargeRule(
  rule: BuyerPortalChargeRule,
  item: BuyerPortalCatalogItem,
  context: PricingRuleContext,
) {
  const sku = String(rule.sku || "").trim().toLowerCase();
  const category = String(rule.category || "").trim().toLowerCase();
  const brand = String(rule.brand || "").trim().toLowerCase();
  if (sku && sku !== String(item.sku || "").trim().toLowerCase()) return false;
  if (category && category !== String(item.category || "").trim().toLowerCase()) return false;
  if (brand && brand !== String(item.brand || "").trim().toLowerCase()) return false;
  if (!matchesRuleText(rule.buyer_email, context.buyerEmail)) return false;
  if (!matchesRuleText(rule.company_name_contains, context.companyName)) return false;
  if (!matchesRuleText(rule.sold_to_contains, context.soldTo)) return false;
  if (!matchesRuleText(rule.ship_to_contains, context.shipTo)) return false;
  if (!matchesRuleText(rule.ship_to_address_contains, context.shipToAddress)) return false;
  return true;
}

function zeroChargeFields(item: BuyerPortalCatalogItem): BuyerPortalCatalogItem {
  return {
    ...item,
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
  };
}

function applyChargeRule(item: BuyerPortalCatalogItem, rule: BuyerPortalChargeRule) {
  const next = { ...item };
  const prefixes = ["discount", "tax", "freight", "octroi", "shipping"] as const;
  for (const prefix of prefixes) {
    const modeKey = `${prefix}_mode` as keyof BuyerPortalCatalogItem & keyof BuyerPortalChargeRule;
    const valueKey = `${prefix}_value` as keyof BuyerPortalCatalogItem & keyof BuyerPortalChargeRule;
    const modeValue = rule[modeKey];
    const numericValue = rule[valueKey];
    if (modeValue !== undefined && modeValue !== null && modeValue !== "") {
      next[modeKey] = modeValue as never;
    }
    if (numericValue !== undefined) {
      next[valueKey] = numericValue as never;
    }
  }
  return next;
}

function applyCheckoutPricing(
  item: BuyerPortalCatalogItem,
  pricing: BuyerPortalPricingSettings | null | undefined,
  context: PricingRuleContext,
) {
  const buyerRules = Array.isArray(pricing?.buyer_rules) ? pricing?.buyer_rules || [] : [];
  const shipToRules = Array.isArray(pricing?.ship_to_rules) ? pricing?.ship_to_rules || [] : [];
  const combineWithDefaults = pricing?.combine_with_product_defaults !== false;

  let effective = combineWithDefaults ? { ...item } : zeroChargeFields(item);

  const buyerRule = buyerRules.find((rule) => matchesChargeRule(rule, item, context));
  if (buyerRule) {
    effective = applyChargeRule(effective, buyerRule);
  }

  const shipToRule = shipToRules.find((rule) => matchesChargeRule(rule, item, context));
  if (shipToRule) {
    effective = applyChargeRule(effective, shipToRule);
  }

  return effective;
}

function statusColor(status?: string | null) {
  const value = String(status || "").toUpperCase();
  if (value.includes("FAIL") || value.includes("ERROR") || value.includes("REJECT")) {
    return { bg: "#fef2f2", fg: "#b91c1c" };
  }
  if (value.includes("PEND") || value.includes("HOLD") || value.includes("NEW") || value.includes("RECEIVED")) {
    return { bg: "#fffbeb", fg: "#b45309" };
  }
  return { bg: "#f0fdf4", fg: "#15803d" };
}

function normalizeMethods(settings: BuyerPortalSettings | null) {
  const methods = settings?.payments?.accepted_methods;
  if (Array.isArray(methods) && methods.length) return methods.filter(Boolean);
  return ["Bank transfer", "Card", "UPI"];
}

function specsEntries(specifications?: Record<string, string> | null) {
  if (!specifications || typeof specifications !== "object") return [];
  return Object.entries(specifications).filter(([key, value]) => key && value);
}

function normalizeMedia(item: BuyerPortalCatalogItem): BuyerPortalMediaItem[] {
  const media = Array.isArray(item.media) ? item.media.filter((entry) => entry?.url) : [];
  if (item.image_url && !media.some((entry) => entry.url === item.image_url)) {
    media.unshift({ kind: "image", url: item.image_url });
  }
  if (item.video_url && !media.some((entry) => entry.url === item.video_url)) {
    media.push({ kind: "video", url: item.video_url });
  }
  return media.map((entry) => ({
    ...entry,
    url: absoluteFileUrl(entry.url),
    poster_url: absoluteFileUrl(entry.poster_url || ""),
    kind: entry.kind || (/\.(mp4|webm|ogg)$/i.test(entry.url) ? "video" : "image"),
  }));
}

function normalizeBrandLogoUrl(value?: string | null) {
  return absoluteFileUrl(value || "");
}

function buildTrackingSteps(
  order: BuyerPortalOrder | null,
  sellerMode: string,
  paymentsEnabled: boolean,
  paymentStatus: string,
): TrackingStep[] {
  if (!order) {
    return [
      {
        key: "received",
        label: "Order received",
        status: "pending",
        detail: "Submit a buyer order to start tracking the flow.",
      },
      {
        key: "payment",
        label: paymentsEnabled ? "Payment" : "Commercial approval",
        status: "pending",
        detail: paymentsEnabled ? "Payment and commercial terms will appear here." : "Commercial approval updates will appear here.",
      },
      {
        key: "processing",
        label: sellerMode === "ERP_INTEGRATED" ? "ERP / order processing" : "Supplier fulfillment",
        status: "pending",
        detail:
          sellerMode === "ERP_INTEGRATED"
            ? "ERP status and fulfilment handoff will appear here."
            : "Supplier-side fulfilment updates will appear here.",
      },
    ];
  }

  const orderStatus = String(order.status || "").toUpperCase();
  const paymentStepStatus: TrackingStep["status"] = !paymentsEnabled
    ? "complete"
    : paymentStatus.toLowerCase().includes("captured") || paymentStatus.toLowerCase().includes("paid")
      ? "complete"
      : orderStatus.includes("ERROR")
        ? "active"
        : "active";

  const processingComplete =
    Boolean(order.processed_at) ||
    String(order.dispatch_status || "").trim() !== "" ||
    String(order.ack_status || "").trim() !== "";

  return [
    {
      key: "received",
      label: "Order received",
      status: "complete",
      detail: order.po_number || order.po_id || "Buyer order captured.",
    },
    {
      key: "payment",
      label: paymentsEnabled ? "Payment" : "Commercial approval",
      status: paymentStepStatus,
      detail: paymentStatus,
    },
    {
      key: "processing",
      label: sellerMode === "ERP_INTEGRATED" ? "ERP / order processing" : "Supplier fulfillment",
      status: processingComplete ? "complete" : "active",
      detail:
        sellerMode === "ERP_INTEGRATED"
          ? `Dispatch: ${order.dispatch_status || "Pending"}, acknowledgement: ${order.ack_status || "Pending"}`
          : order.po_validation_reason || "Supplier can confirm, pack, ship, and close the order from Ordanex.",
    },
  ];
}

export default function BuyerPortalPage({ clientId: propClientId }: Props) {
  const params = useParams<{ clientId?: string; environment?: string }>();
  const clientId = useMemo(
    () => propClientId || params.clientId || resolveClientId(undefined),
    [params.clientId, propClientId],
  );
  const storefrontEnvironment = useMemo(
    () => resolvePortalEnvironment(params.environment),
    [params.environment],
  );
  const storefrontEnvironmentLabel = storefrontEnvironment === "staging" ? "Staging" : "Production";
  const workspaceAuth = getAuth();
  const workspaceHomePath = workspaceAuth ? getPostLoginPath(workspaceAuth.role) : "";
  const [accessState, setAccessState] = useState<any>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [approvalChecking, setApprovalChecking] = useState(false);
  const [approvedBuyerEmail, setApprovedBuyerEmail] = useState("");
  const [catalog, setCatalog] = useState<BuyerPortalCatalogItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [shipTo, setShipTo] = useState("");
  const [shipToAddress, setShipToAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [paymentMethod, setPaymentMethod] = useState("Bank transfer");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentProofName, setPaymentProofName] = useState("");
  const [paymentProofUrl, setPaymentProofUrl] = useState("");
  const [paymentProofDataUrl, setPaymentProofDataUrl] = useState("");
  const [recentOrders, setRecentOrders] = useState<BuyerPortalOrder[]>([]);
  const [submittedOrder, setSubmittedOrder] = useState<BuyerPortalOrder | null>(null);
  const [portalSettings, setPortalSettings] = useState<BuyerPortalSettings | null>(null);
  const [commercialPreviewCatalog, setCommercialPreviewCatalog] = useState<BuyerPortalCatalogItem[] | null>(null);
  const [activeMediaBySku, setActiveMediaBySku] = useState<Record<string, number>>({});
  const [galleryProduct, setGalleryProduct] = useState<BuyerPortalCatalogItem | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);

  useEffect(() => {
    if (!clientId) {
      setAccessLoading(false);
      setBanner("Missing client id in the storefront URL.");
      return;
    }
    setAccessLoading(true);
    const savedBuyerEmail =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem(buyerAccessStorageKey(clientId, storefrontEnvironment)) || ""
        : "";
    if (savedBuyerEmail) {
      setBuyerEmail(savedBuyerEmail);
    }
    fetchBuyerAccess(clientId, savedBuyerEmail || undefined, storefrontEnvironment)
      .then((state) => {
        setAccessState(state);
        if (savedBuyerEmail && state?.buyer_approved) {
          setApprovedBuyerEmail(savedBuyerEmail.trim().toLowerCase());
        } else if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(buyerAccessStorageKey(clientId, storefrontEnvironment));
        }
      })
      .catch((err: any) => {
        setAccessState({ client_id: clientId, buyer_storefront: false });
        setBanner(err?.message || "Buyer storefront access is not enabled for this client.");
      })
      .finally(() => setAccessLoading(false));
  }, [clientId, storefrontEnvironment]);

  useEffect(() => {
    if (!clientId || accessLoading || !accessState?.buyer_storefront || !approvedBuyerEmail) return;
    fetchBuyerPortalSettings(clientId, storefrontEnvironment)
      .then((settings) => setPortalSettings(settings || null))
      .catch((err: any) => setBanner(err?.message || "Failed to load storefront settings."));
  }, [clientId, accessLoading, accessState?.buyer_storefront, approvedBuyerEmail, storefrontEnvironment]);

  useEffect(() => {
    if (!clientId || accessLoading || !accessState?.buyer_storefront || !approvedBuyerEmail) return;
    setLoading(true);
    Promise.all([
      fetchBuyerCatalog(clientId, approvedBuyerEmail, storefrontEnvironment),
      fetchBuyerOrders(clientId, approvedBuyerEmail, storefrontEnvironment),
    ])
      .then(([catalogRows, orders]) => {
        setCatalog(Array.isArray(catalogRows) ? catalogRows : []);
        setRecentOrders(Array.isArray(orders) ? orders : []);
        const firstCurrency = (catalogRows || [])[0]?.currency;
        if (firstCurrency) setCurrency(firstCurrency);
      })
      .catch((err: any) => setBanner(err?.message || "Failed to load storefront data."))
      .finally(() => setLoading(false));
  }, [clientId, accessLoading, accessState?.buyer_storefront, approvedBuyerEmail, storefrontEnvironment]);

  const pricingSettingsForCheckout = portalSettings?.pricing || {};

  const pricingContext = useMemo(
    () => ({
      buyerEmail: approvedBuyerEmail || buyerEmail,
      companyName,
      soldTo: companyName || buyerName,
      shipTo,
      shipToAddress,
    }),
    [approvedBuyerEmail, buyerEmail, companyName, buyerName, shipTo, shipToAddress],
  );

  useEffect(() => {
    if (!clientId || !approvedBuyerEmail || !catalog.length) {
      setCommercialPreviewCatalog(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void previewBuyerPricing({
        client_id: clientId,
        environment: storefrontEnvironment,
        buyer_email: approvedBuyerEmail,
        company_name: companyName || undefined,
        sold_to: companyName || buyerName || undefined,
        ship_to: shipTo || undefined,
        ship_to_address: shipToAddress || undefined,
        currency,
        items: catalog,
      })
        .then((rows) => {
          if (!cancelled) {
            setCommercialPreviewCatalog(Array.isArray(rows) ? rows : []);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCommercialPreviewCatalog(null);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [approvedBuyerEmail, buyerName, catalog, clientId, companyName, currency, shipTo, shipToAddress, storefrontEnvironment]);

  const pricedCatalog = useMemo(() => {
    if (commercialPreviewCatalog && commercialPreviewCatalog.length) {
      const previewMap = new Map(commercialPreviewCatalog.map((item) => [item.sku, item]));
      return catalog.map((item) => previewMap.get(item.sku) || item);
    }
    return catalog.map((item) => applyCheckoutPricing(item, pricingSettingsForCheckout, pricingContext));
  }, [catalog, commercialPreviewCatalog, pricingSettingsForCheckout, pricingContext]);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(pricedCatalog.map((item) => item.category).filter(Boolean) as string[]))],
    [pricedCatalog],
  );

  const filteredCatalog = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pricedCatalog.filter((item) => {
      const matchesCategory = category === "All" || item.category === category;
      const matchesSearch =
        !term ||
        [item.name, item.sku, item.description, item.details, item.brand, item.category]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      return matchesCategory && matchesSearch;
    });
  }, [pricedCatalog, search, category]);

  useEffect(() => {
    const currentCatalog = commercialPreviewCatalog && commercialPreviewCatalog.length
      ? commercialPreviewCatalog
      : catalog.map((item) => applyCheckoutPricing(item, pricingSettingsForCheckout, pricingContext));
    const currentCatalogMap = new Map(currentCatalog.map((item) => [item.sku, item]));
    setCart((current) =>
      current.map((line) => {
        const resolved = currentCatalogMap.get(line.sku);
        if (!resolved) return line;
        return {
          ...resolved,
          quantity: line.quantity,
        };
      }),
    );
  }, [catalog, commercialPreviewCatalog, pricingSettingsForCheckout, pricingContext]);

  const cartPricing = useMemo(
    () =>
      cart.reduce(
        (totals, item) => {
          const pricing = computeCatalogPricing(item, item.quantity);
          totals.subtotal += pricing.subtotal;
          totals.discount += pricing.discount;
          totals.tax += pricing.tax;
          totals.freight += pricing.freight;
          totals.octroi += pricing.octroi;
          totals.shipping += pricing.shipping;
          totals.total += pricing.total;
          return totals;
        },
        { subtotal: 0, discount: 0, tax: 0, freight: 0, octroi: 0, shipping: 0, total: 0 },
      ),
    [cart],
  );

  const branding = portalSettings?.branding || {};
  const storefrontTitle = branding.storefront_title || "Buyer Portal";
  const brandLogoUrl = normalizeBrandLogoUrl(branding.logo_url);
  const heroHeadline =
    branding.hero_headline ||
    "Shop products, submit orders, track fulfillment, and keep buyers informed in one storefront.";
  const heroDescription =
    branding.hero_description ||
    "Buyers can browse a client-specific catalog, add items to cart, enter shipping and payment details, and track the complete purchase flow back to the supplier.";
  const supportEmail = branding.support_email || "hello@ordanex.ai";
  const accentColor = branding.accent_color || "#2563eb";
  const catalogTitle = portalSettings?.catalog?.title || "Catalog";
  const catalogDescription =
    portalSettings?.catalog?.description || "Browse approved products, pricing, lead times, and payment expectations.";
  const commerce = portalSettings?.commerce || {};
  const payments = portalSettings?.payments || {};
  const experience = portalSettings?.experience || {};
  const pricingSettings = portalSettings?.pricing || {};
  const acceptedMethods = normalizeMethods(portalSettings);
  const paymentsEnabled = payments.enabled !== false;
  const paymentMode = String(payments.mode || "INVOICE_LATER").toUpperCase();
  const paymentProvider = payments.provider_name || "Supplier Direct";
  const paymentTerms = payments.payment_terms || "Net 30";
  const paymentLinkUrl = String(payments.payment_link_url || "").trim();
  const paymentLinkLabel = String(payments.payment_link_label || "Pay supplier").trim() || "Pay supplier";
  const paymentInstructions = normalizePaymentGuidanceText(payments.instructions || DEFAULT_PAYMENT_GUIDANCE);
  const paymentProofInstructions =
    payments.proof_of_payment_instructions || "Share your UTR, transaction id, or payment confirmation after completing payment.";
  const sellerMode = String(commerce.seller_mode || "ERP_INTEGRATED").toUpperCase();
  const orderFlowMode = String(commerce.order_flow_mode || "ERP_ORCHESTRATED").toUpperCase();
  const buyerTrackingMode = String(commerce.buyer_tracking_mode || "LIVE_ERP").toUpperCase();
  const supplierDisplayName = commerce.supplier_display_name || "Configured Supplier";
  const showProductSpecs = experience.show_product_specs !== false;
  const showInventoryStatus = experience.show_inventory_status !== false;
  const showCheckoutPromises = experience.show_checkout_promises !== false;
  const supplierPortalLabel = supplierDisplayName && supplierDisplayName !== storefrontTitle
    ? `${supplierDisplayName} Supplier Portal`
    : storefrontTitle;
  const availableCount = pricedCatalog.filter((item) => String(item.stock_status || "Available").toLowerCase() !== "out of stock").length;
  const categoryCount = Math.max(0, categories.length - 1);
  const compactHeadline =
    sellerMode === "STANDALONE_COMMERCE"
      ? "A protected buying surface for supplier-managed commerce."
      : "A buyer-friendly portal powered by the Ordanex transaction backbone.";

  const submittedOrderPaymentStatus = normalizeBuyerPaymentStatus(
    submittedOrder?.payment_status,
    Boolean(submittedOrder?.invoice?.invoice_number),
  );

  const trackingSteps =
    Array.isArray(submittedOrder?.tracking_steps) && submittedOrder?.tracking_steps.length
      ? submittedOrder.tracking_steps
      : buildTrackingSteps(
          submittedOrder,
          sellerMode,
          paymentsEnabled,
          submittedOrderPaymentStatus ||
            (paymentsEnabled
              ? paymentReference
                ? "Payment captured"
                : paymentMode === "INVOICE_LATER"
                  ? INVOICE_ISSUED_PAYMENT_STATUS
                  : paymentMode === "PAYMENT_LINK"
                    ? "Awaiting payment through secure link"
                    : "Awaiting payment confirmation"
              : "Commercial terms handled directly with the supplier"),
        );

  const galleryMedia = useMemo(
    () => (galleryProduct ? normalizeMedia(galleryProduct) : []),
    [galleryProduct],
  );

  const galleryActiveMedia =
    galleryMedia.length > 0 ? galleryMedia[Math.min(galleryIndex, galleryMedia.length - 1)] : null;
  const mediaWatermarkLabel = supplierDisplayName || supplierPortalLabel || storefrontTitle || "Configured Supplier";

  function addToCart(item: BuyerPortalCatalogItem) {
    setCart((current) => {
      const found = current.find((line) => line.sku === item.sku);
      if (found) {
        return current.map((line) => (line.sku === item.sku ? { ...line, quantity: line.quantity + 1 } : line));
      }
      return [...current, { ...item, quantity: Math.max(1, Number(item.min_order_qty || 1)) }];
    });
  }

  function setLineQuantity(sku: string, quantity: number) {
    setCart((current) =>
      current.map((line) =>
        line.sku === sku ? { ...line, quantity: Math.max(Number(line.min_order_qty || 1), quantity || 1) } : line,
      ),
    );
  }

  function removeFromCart(sku: string) {
    setCart((current) => current.filter((line) => line.sku !== sku));
  }

  async function handlePaymentProofChange(file?: File | null) {
    if (!file) return;
    if (file.size > MAX_PAYMENT_PROOF_BYTES) {
      setBanner("Payment proof file is too large. Use a file up to 4MB.");
      return;
    }
    const allowed =
      file.type === "application/pdf" ||
      file.type.startsWith("image/") ||
      /\.(pdf|png|jpe?g|webp)$/i.test(file.name);
    if (!allowed) {
      setBanner("Use PDF or image files for proof of payment.");
      return;
    }
    try {
      const uploaded = await uploadPortalFile({
        file,
        clientId: clientId || null,
        scope: "payment-proof",
      });
      setPaymentProofName(uploaded.fileName || file.name);
      setPaymentProofUrl(uploaded.fileUrl || "");
      setPaymentProofDataUrl(uploaded.fileDataUrl || "");
      setBanner(
        `${uploaded.storageMode === "remote" ? "Uploaded" : "Attached"} payment proof: ${uploaded.fileName || file.name}`,
      );
    } catch (err: any) {
      setBanner(err?.message || "Failed to load payment proof file.");
    }
  }

  function openGallery(item: BuyerPortalCatalogItem, mediaIndex = 0) {
    setGalleryProduct(item);
    setGalleryIndex(mediaIndex);
  }

  function closeGallery() {
    setGalleryProduct(null);
    setGalleryIndex(0);
  }

  async function verifyBuyerAccess() {
    const normalizedEmail = buyerEmail.trim().toLowerCase();
    if (!clientId) {
      setBanner("Missing client id in the storefront URL.");
      return;
    }
    if (!normalizedEmail) {
      setBanner("Enter your approved buyer email to access protected supplier media and catalog details.");
      return;
    }
    try {
      setApprovalChecking(true);
      const state = await fetchBuyerAccess(clientId, normalizedEmail, storefrontEnvironment);
      setAccessState(state);
      if (!state?.buyer_approved) {
        throw new Error(state?.access_message || "This buyer email is not approved for the storefront.");
      }
      setApprovedBuyerEmail(normalizedEmail);
      setBuyerEmail(normalizedEmail);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          buyerAccessStorageKey(clientId, storefrontEnvironment),
          normalizedEmail,
        );
      }
      setBanner(`Access approved for ${normalizedEmail}. Protected catalog media is now enabled for this session.`);
    } catch (err: any) {
      setApprovedBuyerEmail("");
      setCatalog([]);
      setRecentOrders([]);
      setSubmittedOrder(null);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(buyerAccessStorageKey(clientId, storefrontEnvironment));
      }
      setBanner(err?.message || "Unable to verify buyer access.");
    } finally {
      setApprovalChecking(false);
    }
  }

  function resetBuyerAccess() {
    setApprovedBuyerEmail("");
    setBuyerEmail("");
    setCatalog([]);
    setRecentOrders([]);
    setSubmittedOrder(null);
    setGalleryProduct(null);
    setGalleryIndex(0);
    if (typeof window !== "undefined" && clientId) {
      window.sessionStorage.removeItem(buyerAccessStorageKey(clientId, storefrontEnvironment));
    }
  }

  function handlePortalLogout() {
    resetBuyerAccess();
    setBanner("Buyer session cleared. Enter an approved buyer email to open the protected catalog again.");
  }

  function handleOpenWorkspace() {
    if (!workspaceHomePath || typeof window === "undefined") return;
    window.location.assign(workspaceHomePath);
  }

  async function openOrderDetails(orderId: string) {
    try {
      setLoading(true);
      const detail = await fetchBuyerOrder(orderId);
      setSubmittedOrder(detail);
      setBanner(`Loaded order ${detail.po_number || detail.po_id} for review.`);
    } catch (err: any) {
      setBanner(err?.message || "Failed to load order details.");
    } finally {
      setLoading(false);
    }
  }

  async function placeOrder() {
    if (!clientId) {
      setBanner("Missing client id in the storefront URL.");
      return;
    }
    if (!approvedBuyerEmail) {
      setBanner("Verify your approved buyer email before placing an order.");
      return;
    }
    if (!buyerName.trim() || !buyerEmail.trim() || !cart.length) {
      setBanner("Please enter your name, email, and at least one item.");
      return;
    }
    setLoading(true);
    setBanner(null);
    try {
      const order = await submitBuyerOrder({
        client_id: clientId,
        environment: storefrontEnvironment,
        buyer_name: buyerName,
        buyer_email: approvedBuyerEmail,
        company_name: companyName || undefined,
        sold_to: companyName || buyerName,
        ship_to: shipTo || undefined,
        ship_to_name: shipTo || companyName || buyerName,
        ship_to_address: shipToAddress || undefined,
        currency,
        notes: notes || undefined,
        payment_method: paymentsEnabled ? paymentMethod : undefined,
        payment_reference: paymentReference || undefined,
        payment_proof_name: paymentProofName || undefined,
        payment_proof_url: paymentProofUrl || undefined,
        payment_proof_data_url: paymentProofDataUrl || undefined,
        items: cart.map(
          (line): BuyerPortalOrderItem => ({
            sku: line.sku,
            name: line.name,
            description: line.description,
            quantity: line.quantity,
            unit_price: line.unit_price,
            uom: line.uom || "EA",
            discount_mode: line.discount_mode,
            discount_value: line.discount_value,
            tax_mode: line.tax_mode,
            tax_value: line.tax_value,
            freight_mode: line.freight_mode,
            freight_value: line.freight_value,
            octroi_mode: line.octroi_mode,
            octroi_value: line.octroi_value,
            shipping_mode: line.shipping_mode,
            shipping_value: line.shipping_value,
          }),
        ),
      });
      const orderWithProof = {
        ...order,
        payment_proof_name: order.payment_proof_name || paymentProofName || undefined,
        payment_proof_url: order.payment_proof_url || paymentProofUrl || undefined,
        payment_proof_data_url: order.payment_proof_data_url || paymentProofDataUrl || undefined,
      };
      setSubmittedOrder(orderWithProof);
      setCart([]);
      setPaymentReference("");
      setPaymentProofName("");
      setPaymentProofUrl("");
      setPaymentProofDataUrl("");
      setBanner(`Order ${order.po_number || order.po_id} submitted successfully.`);
      const refreshed = await fetchBuyerOrder(order.po_id);
      setSubmittedOrder({
        ...refreshed,
        payment_proof_name: refreshed.payment_proof_name || orderWithProof.payment_proof_name,
        payment_proof_url: refreshed.payment_proof_url || orderWithProof.payment_proof_url,
        payment_proof_data_url: refreshed.payment_proof_data_url || orderWithProof.payment_proof_data_url,
      });
      const history = await fetchBuyerOrders(clientId, approvedBuyerEmail, storefrontEnvironment);
      setRecentOrders(Array.isArray(history) ? history : []);
    } catch (err: any) {
      setBanner(err?.message || "Failed to place order.");
    } finally {
      setLoading(false);
    }
  }

  if (accessLoading) {
    return <div style={shell}><div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 18px 40px", color: "#475569" }}>Loading storefront access and catalog configuration...</div></div>;
  }

  if (accessState && !accessState.buyer_storefront) {
    return (
      <div style={shell}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 18px 40px" }}>
          <section style={{ ...panel, padding: 28, display: "grid", gap: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Storefront not enabled</div>
            <div style={{ color: "#475569", lineHeight: 1.7 }}>
              The buyer portal is not enabled for this client yet.
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (!approvedBuyerEmail) {
    return (
      <div style={shell}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 18px 40px" }}>
          {banner ? (
            <div style={{ ...panel, borderColor: "#c7d2fe", background: "#eff6ff", color: "#1d4ed8", padding: 14, marginBottom: 16, fontWeight: 700 }}>
              {banner}
            </div>
          ) : null}
          <section style={{ ...panel, padding: 28, display: "grid", gap: 18, maxWidth: 720 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#2563eb" }}>
                Protected Supplier Catalog
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a", marginTop: 8 }}>
                Enter your approved buyer email to view secure product media.
              </div>
              <div style={{ marginTop: 10, color: "#475569", lineHeight: 1.7 }}>
                Sensitive supplier images and videos are only streamed to approved buyers. Ordanex does not expose direct product-media download links in the storefront session.
              </div>
            </div>
            <div style={{ display: "grid", gap: 12, maxWidth: 440 }}>
              <input
                style={field}
                placeholder="Approved buyer email"
                value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void verifyBuyerAccess();
                  }
                }}
              />
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button type="button" onClick={() => void verifyBuyerAccess()} style={primaryButton}>
                  {approvalChecking ? "Verifying..." : "Verify access"}
                </button>
              </div>
              <div style={mutedText}>
                {accessState?.access_message || "Only approved buyer emails can access this storefront."}
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 18px 40px" }}>
        <section style={{ ...panel, padding: 20, marginBottom: 16, background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)" }}>
          <div style={portalHeaderGrid}>
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                {brandLogoUrl ? (
                  <div style={brandLogoShell}>
                    <img src={brandLogoUrl} alt={supplierPortalLabel} style={brandLogoImage} />
                  </div>
                ) : (
                  <div style={brandMonogram}>{supplierDisplayName.slice(0, 1).toUpperCase() || "S"}</div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={brandEyebrow}>Supplier storefront powered by Ordanex</div>
                  <div style={brandTitle}>{supplierPortalLabel}</div>
                  <div style={brandSubtitle}>{compactHeadline}</div>
                </div>
              </div>
              <div style={brandPillRow}>
                <span style={{ ...brandPill, background: "#dbeafe", color: "#1d4ed8", borderColor: "#bfdbfe" }}>Protected media session</span>
                <span style={{ ...brandPill, background: storefrontEnvironment === "staging" ? "#fef3c7" : "#dcfce7", color: storefrontEnvironment === "staging" ? "#92400e" : "#166534", borderColor: storefrontEnvironment === "staging" ? "#fcd34d" : "#86efac" }}>
                  {storefrontEnvironmentLabel}
                </span>
                <span style={brandPill}>{approvedBuyerEmail}</span>
                <span style={brandPill}>{supplierDisplayName}</span>
                {workspaceHomePath ? (
                  <button type="button" onClick={handleOpenWorkspace} style={ghostButton}>
                    Open workspace
                  </button>
                ) : null}
                <button type="button" onClick={resetBuyerAccess} style={ghostButton}>
                  Switch buyer email
                </button>
                <button type="button" onClick={handlePortalLogout} style={ghostButton}>
                  Logout
                </button>
              </div>
            </div>

            <div style={headerMetricsGrid}>
              <div style={metricCard}>
                <div style={metricLabel}>Products</div>
                <div style={metricValue}>{catalog.length}</div>
                <div style={metricHint}>{availableCount} available now</div>
              </div>
              <div style={metricCard}>
                <div style={metricLabel}>Categories</div>
                <div style={metricValue}>{categoryCount}</div>
                <div style={metricHint}>Structured supplier assortment</div>
              </div>
              <div style={metricCard}>
                <div style={metricLabel}>Support</div>
                <div style={metricValueWide}>{supportEmail}</div>
                <div style={metricHint}>Buyer assistance and order follow-up</div>
              </div>
            </div>
          </div>
        </section>

        {banner ? (
          <div style={{ ...panel, borderColor: "#c7d2fe", background: "#eff6ff", color: "#1d4ed8", padding: 14, marginBottom: 16, fontWeight: 700 }}>
            {banner}
          </div>
        ) : null}

        <section style={{ ...panel, padding: 18, marginBottom: 16 }}>
          <div style={heroGrid}>
            <div style={{ ...heroCard, background: `linear-gradient(135deg, ${accentColor} 0%, #1d4ed8 42%, #0f172a 100%)` }}>
              <div style={{ display: "grid", gap: 16 }}>
                <div>
                  <div style={heroEyebrow}>Catalog to cash</div>
                  <div style={heroTitle}>{heroHeadline}</div>
                  <p style={heroDescriptionStyle}>{heroDescription}</p>
                </div>
                <div style={heroBrandBlock}>
                  <div style={heroBrandName}>{supplierDisplayName}</div>
                  <div style={heroBrandText}>
                    Buyers can browse supplier-approved products, place orders, upload payment proof, and track fulfillment from one guided workspace.
                  </div>
                </div>
                <div style={heroMiniGrid}>
                  <div style={heroMiniCard}>
                    <div style={heroMiniLabel}>Catalog</div>
                    <div style={heroMiniValue}>{catalogTitle}</div>
                  </div>
                  <div style={heroMiniCard}>
                    <div style={heroMiniLabel}>Payments</div>
                    <div style={heroMiniValue}>{paymentsEnabled ? paymentProvider : "Supplier direct"}</div>
                  </div>
                  <div style={heroMiniCard}>
                    <div style={heroMiniLabel}>Tracking</div>
                    <div style={heroMiniValue}>{buyerTrackingMode === "PORTAL_UPDATES" ? "Portal updates" : "ERP and shipment visibility"}</div>
                  </div>
                </div>
              </div>
              <div>
                <div style={heroPillRow}>
                  <span style={heroPill}>{sellerMode === "STANDALONE_COMMERCE" ? "Supplier without ERP" : "ERP-integrated supplier"}</span>
                  <span style={heroPill}>{orderFlowMode === "ORDANEX_MANAGED" ? "Ordanex-managed order flow" : "ERP-orchestrated order flow"}</span>
                  <span style={heroPill}>{buyerTrackingMode === "PORTAL_UPDATES" ? "Portal updates" : "Live ERP / fulfillment tracking"}</span>
                </div>
              </div>
            </div>

            <div style={{ ...panel, padding: 18, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={sectionLabel}>Buyer details</div>
                  <div style={mutedSmall}>Place an order with supplier and payment context in one step.</div>
                </div>
                <div style={checkoutHint}>Order desk</div>
              </div>
              <input style={field} placeholder="Buyer name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
              <input style={{ ...field, background: "#f8fafc" }} placeholder="Buyer email" value={buyerEmail} readOnly />
              <input style={field} placeholder="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              <input style={field} placeholder="Ship-to name" value={shipTo} onChange={(e) => setShipTo(e.target.value)} />
              <input style={field} placeholder="Ship-to address" value={shipToAddress} onChange={(e) => setShipToAddress(e.target.value)} />
              <textarea style={{ ...field, minHeight: 96, resize: "vertical" }} placeholder="Order notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div style={sectionLabel}>Payment setup</div>
              <select style={field} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                {acceptedMethods.map((method) => <option key={method} value={method}>{method}</option>)}
              </select>
              <input style={field} placeholder="Transaction / remittance reference" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} />
              <div style={guidanceBox}>
                <div style={sectionLabel}>Payment guidance</div>
                <div style={mutedText}>{paymentInstructions}</div>
                <div style={{ ...mutedText, marginTop: 6 }}>Terms: {paymentTerms}</div>
                {paymentMode === "PAYMENT_LINK" && paymentLinkUrl ? (
                  <a href={paymentLinkUrl} target="_blank" rel="noreferrer" style={linkCta}>
                    {paymentLinkLabel}
                  </a>
                ) : null}
                {paymentsEnabled ? <div style={{ ...mutedText, marginTop: 6 }}>{paymentProofInstructions}</div> : null}
              </div>
              {paymentsEnabled ? (
                <div style={guidanceBox}>
                  <div style={sectionLabel}>Proof of payment</div>
                  <div style={mutedText}>
                    Upload a payment receipt, screenshot, or PDF so the supplier can verify bank transfer or external payment completion.
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                    <label style={uploadButton}>
                      Upload proof
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        hidden
                        onChange={(e) => void handlePaymentProofChange(e.target.files?.[0] || null)}
                      />
                    </label>
                    {paymentProofName ? <div style={mutedSmall}>Attached: {paymentProofName}</div> : null}
                    {paymentProofName ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentProofName("");
                          setPaymentProofUrl("");
                          setPaymentProofDataUrl("");
                        }}
                        style={ghostButton}
                      >
                        Remove proof
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div style={currencyRow}>
                <div style={{ flex: "1 1 160px" }}>
                  <div style={sectionLabel}>Currency</div>
                  <input style={field} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
                </div>
                <button type="button" onClick={placeOrder} disabled={loading || !cart.length} style={primaryButton}>
                  {loading ? "Placing..." : "Place Order"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <div style={contentGrid}>
          <section style={{ ...panel, padding: 18 }}>
            <div style={catalogHeader}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#0f172a" }}>{catalogTitle}</div>
                <div style={mutedText}>{catalogDescription}</div>
              </div>
              <input style={{ ...field, width: 280 }} placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <div style={filterRow}>
              {categories.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setCategory(entry)}
                  style={{
                    ...tagButton,
                    background: category === entry ? "#dbeafe" : "#fff",
                    color: category === entry ? "#1d4ed8" : "#0f172a",
                    borderColor: category === entry ? "#93c5fd" : "#dbe2ea",
                  }}
                >
                  {entry}
                </button>
              ))}
            </div>

            {loading && !catalog.length ? <div style={mutedText}>Loading catalog...</div> : null}

            <div style={productGrid}>
              {filteredCatalog.map((item) => {
                const media = normalizeMedia(item);
                const activeIndex = Math.min(
                  activeMediaBySku[item.sku] ?? 0,
                  Math.max(0, media.length - 1),
                );
                const heroMedia = media[activeIndex] || media[0] || null;
                return (
                  <article key={item.sku} style={productCard}>
                    <div style={productMediaShell}>
                      {heroMedia ? (
                        heroMedia.kind === "video" ? (
                          <div
                            style={productMediaInteractive}
                            onClick={() => openGallery(item, activeIndex)}
                            onContextMenu={(e) => e.preventDefault()}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openGallery(item, activeIndex);
                              }
                            }}
                          >
                            <video
                              src={heroMedia.url}
                              controls
                              disablePictureInPicture
                              style={productVideo}
                              onContextMenu={(e) => e.preventDefault()}
                            />
                            <div style={mediaWatermark}>{mediaWatermarkLabel}</div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            style={mediaOpenButton}
                            onClick={() => openGallery(item, activeIndex)}
                            onContextMenu={(e) => e.preventDefault()}
                          >
                            <img
                              src={heroMedia.url}
                              alt={item.name}
                              style={productImage}
                              draggable={false}
                              onContextMenu={(e) => e.preventDefault()}
                            />
                            <div style={mediaWatermark}>{mediaWatermarkLabel}</div>
                          </button>
                        )
                      ) : (
                        <div style={productMediaEmpty}>No product media</div>
                      )}
                    </div>
                    <div style={productBody}>
                      <div style={productTopRow}>
                        <div>
                          <div style={productCategory}>{item.category || "Catalog"}</div>
                          <div style={productTitle}>{item.name}</div>
                          <div style={productSubline}>
                            {(item.brand || supplierDisplayName) && `${item.brand || supplierDisplayName} | `}
                            {item.sku}
                          </div>
                        </div>
                        <div style={productPrice}>{money(item.unit_price, item.currency)}</div>
                      </div>

                      <div style={productText}>{item.description || item.details}</div>

                      <div style={chipRow}>
                        {showInventoryStatus ? <span style={inventoryChip(statusColor(item.stock_status))}>{item.stock_status || "Available"}</span> : null}
                        {item.lead_time && showCheckoutPromises ? <span style={tag}>Lead time: {item.lead_time}</span> : null}
                        {item.min_order_qty ? <span style={tag}>MOQ {item.min_order_qty} {item.moq_uom || item.uom || ""}</span> : null}
                        {item.payment_terms ? <span style={tag}>{item.payment_terms}</span> : null}
                        {summarizeCatalogCharges(item).map((entry) => <span key={entry} style={tag}>{entry}</span>)}
                      </div>

                      <div style={mutedSmall}>
                        Estimated landed total at MOQ: {money(computeCatalogPricing(item, Number(item.min_order_qty || 1)).total, item.currency)}
                      </div>

                      {showProductSpecs && specsEntries(item.specifications).length ? (
                        <div style={specGrid}>
                          {specsEntries(item.specifications).map(([specKey, specValue]) => (
                            <div key={specKey} style={specRow}>
                              <span style={specKeyStyle}>{specKey}</span>
                              <span>{specValue}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {media.length > 1 ? (
                        <div style={thumbRow}>
                          {media.slice(0, 6).map((entry, index) => (
                            <button
                              key={entry.url}
                              type="button"
                              style={{
                                ...thumbFrame,
                                borderColor: activeIndex === index ? "#2563eb" : "#dbe2ea",
                                boxShadow: activeIndex === index ? "0 0 0 2px rgba(37, 99, 235, 0.15)" : "none",
                              }}
                              onClick={() =>
                                setActiveMediaBySku((current) => ({
                                  ...current,
                                  [item.sku]: index,
                                }))
                              }
                            >
                              {entry.kind === "video" ? (
                                <div style={videoThumbLabel}>Video</div>
                              ) : (
                                <img src={entry.url} alt={entry.label || item.name} style={thumbImage} />
                              )}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <div style={productBottomRow}>
                        <div style={mutedSmall}>Supplier: {item.supplier_name || supplierDisplayName}</div>
                        <button type="button" onClick={() => addToCart(item)} style={darkButton}>
                          Add to Cart
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside style={{ display: "grid", gap: 16 }}>
            <section style={{ ...panel, padding: 18 }}>
              <div style={sideTitle}>Cart</div>
              {cart.length === 0 ? (
                <div style={mutedText}>Your cart is empty. Add products from the catalog.</div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {cart.map((line) => {
                    const linePricing = computeCatalogPricing(line, line.quantity);
                    return (
                      <div key={line.sku} style={cartRow}>
                        <div style={cartTop}>
                          <div>
                            <div style={cartTitle}>{line.name}</div>
                            <div style={mutedSmall}>{line.sku}</div>
                          </div>
                          <button type="button" onClick={() => removeFromCart(line.sku)} style={tagButton}>
                            Remove
                          </button>
                        </div>
                        <div style={cartBottom}>
                          <input
                            type="number"
                            min={Number(line.min_order_qty || 1)}
                            value={line.quantity}
                            onChange={(e) => setLineQuantity(line.sku, Number(e.target.value || 1))}
                            style={{ ...field, width: 96 }}
                          />
                          <div style={cartAmount}>{money(linePricing.total, line.currency)}</div>
                        </div>
                        <div style={{ ...mutedSmall, marginTop: 8 }}>
                          Base {money(linePricing.subtotal, line.currency)}
                          {linePricing.discount ? ` | Discount -${money(linePricing.discount, line.currency)}` : ""}
                          {linePricing.tax ? ` | Tax ${money(linePricing.tax, line.currency)}` : ""}
                          {linePricing.freight ? ` | Freight ${money(linePricing.freight, line.currency)}` : ""}
                          {linePricing.octroi ? ` | Octroi ${money(linePricing.octroi, line.currency)}` : ""}
                          {linePricing.shipping ? ` | Shipping ${money(linePricing.shipping, line.currency)}` : ""}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={cartTotalRow}>
                      <span>Subtotal</span>
                      <span>{money(cartPricing.subtotal, currency)}</span>
                    </div>
                    {cartPricing.discount ? (
                      <div style={cartTotalRow}>
                        <span>Discount</span>
                        <span>-{money(cartPricing.discount, currency)}</span>
                      </div>
                    ) : null}
                    {cartPricing.tax ? (
                      <div style={cartTotalRow}>
                        <span>Tax</span>
                        <span>{money(cartPricing.tax, currency)}</span>
                      </div>
                    ) : null}
                    {cartPricing.freight ? (
                      <div style={cartTotalRow}>
                        <span>Freight</span>
                        <span>{money(cartPricing.freight, currency)}</span>
                      </div>
                    ) : null}
                    {cartPricing.octroi ? (
                      <div style={cartTotalRow}>
                        <span>Octroi</span>
                        <span>{money(cartPricing.octroi, currency)}</span>
                      </div>
                    ) : null}
                    {cartPricing.shipping ? (
                      <div style={cartTotalRow}>
                        <span>Shipping</span>
                        <span>{money(cartPricing.shipping, currency)}</span>
                      </div>
                    ) : null}
                    <div style={cartTotalRow}>
                      <span>Estimated total</span>
                      <span>{money(cartPricing.total, currency)}</span>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section style={{ ...panel, padding: 18 }}>
              <div style={sideTitle}>Purchase Flow</div>
              <div style={{ display: "grid", gap: 10 }}>
                {trackingSteps.map((step) => (
                  <div key={step.key} style={trackingCard(step.status)}>
                    <div style={trackingTop}>
                      <div style={trackingLabel}>{step.label}</div>
                      <span style={trackingBadge(step.status)}>{step.status.toUpperCase()}</span>
                    </div>
                    <div style={trackingDetail}>{step.detail}</div>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ ...panel, padding: 18 }}>
              <div style={sideTitle}>Order Status</div>
              {submittedOrder ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={statusHeaderRow}>
                    <div>
                      <div style={cartTitle}>{submittedOrder.po_number || submittedOrder.po_id}</div>
                      <div style={mutedSmall}>Buyer order submitted to {supplierDisplayName}</div>
                    </div>
                    <span style={{ ...statusPill, ...statusColor(submittedOrder.status) }}>{submittedOrder.status || "NEW"}</span>
                  </div>
                  <div style={mutedText}>Payment: {submittedOrderPaymentStatus || "Pending"}</div>
                  <div style={mutedText}>Method: {submittedOrder.payment_method || paymentMethod || paymentProvider}</div>
                  <div style={mutedText}>Reference: {submittedOrder.payment_reference || "Awaiting buyer update"}</div>
                  <div style={mutedSmall}>
                    Client-side order handling, shipment updates, invoice updates, and status progression continue inside the Ordanex workspace.
                  </div>
                  {submittedOrder.payment_proof_name || submittedOrder.payment_proof_url || submittedOrder.payment_proof_data_url ? (
                    <div style={detailCard}>
                      <div style={detailTitle}>Payment Proof</div>
                      <div style={mutedText}>Document: {submittedOrder.payment_proof_name || "Uploaded proof"}</div>
                      {submittedOrder.payment_proof_url || submittedOrder.payment_proof_data_url ? (
                        <a
                          href={absoluteFileUrl(submittedOrder.payment_proof_url || submittedOrder.payment_proof_data_url || "#")}
                          target="_blank"
                          rel="noreferrer"
                          style={linkCta}
                        >
                          Open payment proof
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                  <div style={mutedText}>ERP Dispatch: {submittedOrder.dispatch_status || "Pending"}</div>
                  <div style={mutedText}>ERP Acknowledgement: {submittedOrder.ack_status || "Pending"}</div>
                  {submittedOrder.invoice ? (
                    <div style={detailCard}>
                      <div style={detailTitle}>Invoice</div>
                      <div style={mutedText}>Number: {submittedOrder.invoice.invoice_number || "Pending"}</div>
                      <div style={mutedText}>
                        Amount: {submittedOrder.invoice.invoice_amount != null ? money(submittedOrder.invoice.invoice_amount, submittedOrder.invoice.currency || currency) : "Pending"}
                      </div>
                      <div style={mutedText}>Due date: {submittedOrder.invoice.due_date || "Pending"}</div>
                      <div style={mutedText}>Payment status: {normalizeBuyerPaymentStatus(submittedOrder.invoice.payment_status || submittedOrderPaymentStatus, Boolean(submittedOrder.invoice.invoice_number)) || "Pending"}</div>
                      {submittedOrder.invoice.invoice_url ? <a href={absoluteFileUrl(submittedOrder.invoice.invoice_url)} target="_blank" rel="noreferrer" style={linkCta}>Open invoice</a> : null}
                    </div>
                  ) : null}
                  {submittedOrder.shipment ? (
                    <div style={detailCard}>
                      <div style={detailTitle}>Shipment</div>
                      <div style={mutedText}>Shipment no: {submittedOrder.shipment.shipment_number || "Pending"}</div>
                      <div style={mutedText}>Status: {submittedOrder.shipment.shipment_status || submittedOrder.dispatch_status || "Pending"}</div>
                      <div style={mutedText}>Carrier: {submittedOrder.shipment.carrier || "Pending"}</div>
                      <div style={mutedText}>Tracking no: {submittedOrder.shipment.tracking_number || "Pending"}</div>
                      <div style={mutedText}>ETA: {submittedOrder.shipment.estimated_delivery_date || "Pending"}</div>
                      {submittedOrder.shipment.tracking_url ? <a href={submittedOrder.shipment.tracking_url} target="_blank" rel="noreferrer" style={linkCta}>Track shipment</a> : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div style={mutedText}>Submitted orders will appear here with payment and ERP status updates.</div>
              )}
            </section>

            <section style={{ ...panel, padding: 18 }}>
              <div style={sideTitle}>Recent Orders</div>
              {recentOrders.length === 0 ? (
                <div style={mutedText}>Submit an order to start building buyer history.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {recentOrders.slice(0, 5).map((order) => (
                    <div key={order.po_id} style={detailCard}>
                      <div style={statusHeaderRow}>
                        <div>
                          <div style={cartTitle}>{order.po_number || order.po_id}</div>
                          <div style={mutedSmall}>{order.supplier_name || order.client_id}</div>
                        </div>
                        <span style={{ ...statusPill, ...statusColor(order.status) }}>{order.status || "NEW"}</span>
                      </div>
                      <div style={mutedText}>{normalizeBuyerPaymentStatus(order.payment_status, Boolean(order.invoice?.invoice_number)) || "Payment pending"}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginTop: 10 }}>
                        <div style={mutedSmall}>
                          {order.environment ? `Environment: ${order.environment}` : `Environment: ${storefrontEnvironmentLabel}`}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={() => void openOrderDetails(order.po_id)}
                            style={ghostButton}
                          >
                            View details
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
      {galleryProduct && galleryActiveMedia ? (
        <div style={galleryOverlay} onClick={closeGallery}>
          <div style={galleryDialog} onClick={(e) => e.stopPropagation()}>
            <div style={galleryHeader}>
              <div>
                <div style={galleryTitle}>{galleryProduct.name}</div>
                <div style={mutedSmall}>
                  {galleryProduct.sku}
                  {galleryProduct.category ? ` | ${galleryProduct.category}` : ""}
                </div>
              </div>
              <button type="button" onClick={closeGallery} style={galleryCloseButton}>
                Close
              </button>
            </div>
            <div style={galleryStage}>
              {galleryActiveMedia.kind === "video" ? (
                <div style={galleryMediaStage}>
                  <video
                    src={galleryActiveMedia.url}
                    controls
                    autoPlay
                    disablePictureInPicture
                    style={galleryVideo}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                  <div style={galleryWatermark}>{mediaWatermarkLabel}</div>
                </div>
              ) : (
                <div style={galleryMediaStage}>
                  <img
                    src={galleryActiveMedia.url}
                    alt={galleryProduct.name}
                    style={galleryImage}
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                  <div style={galleryWatermark}>{mediaWatermarkLabel}</div>
                </div>
              )}
            </div>
            {galleryMedia.length > 1 ? (
              <div style={galleryThumbRow}>
                {galleryMedia.map((entry, index) => (
                  <button
                    key={entry.url}
                    type="button"
                    style={{
                      ...galleryThumb,
                      borderColor: galleryIndex === index ? "#2563eb" : "#dbe2ea",
                      boxShadow: galleryIndex === index ? "0 0 0 2px rgba(37, 99, 235, 0.15)" : "none",
                    }}
                    onClick={() => setGalleryIndex(index)}
                  >
                    {entry.kind === "video" ? (
                      <div style={galleryVideoLabel}>Video</div>
                    ) : (
                      <img
                        src={entry.url}
                        alt={entry.label || galleryProduct.name}
                        style={galleryThumbImage}
                        draggable={false}
                        onContextMenu={(e) => e.preventDefault()}
                      />
                    )}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const shell: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top left, rgba(37, 99, 235, 0.08), transparent 30%), radial-gradient(circle at top right, rgba(16, 185, 129, 0.08), transparent 26%), linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)",
};

const panel: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  boxShadow: "0 16px 48px rgba(15, 23, 42, 0.06)",
  minWidth: 0,
  overflow: "hidden",
};

const field: React.CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  border: "1px solid #dbe2ea",
  borderRadius: 12,
  padding: "11px 12px",
  minHeight: 44,
  fontSize: 14,
  lineHeight: 1.4,
  outline: "none",
  background: "#fff",
  boxSizing: "border-box",
  display: "block",
  margin: 0,
};

const primaryButton: React.CSSProperties = {
  border: "1px solid #0b5fff",
  background: "#0b5fff",
  color: "#fff",
  borderRadius: 12,
  padding: "12px 16px",
  fontWeight: 800,
  cursor: "pointer",
};

const uploadButton: React.CSSProperties = {
  border: "1px solid #1d4ed8",
  background: "#eff6ff",
  color: "#1d4ed8",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
};

const ghostButton: React.CSSProperties = {
  border: "1px solid #dbe2ea",
  background: "#fff",
  color: "#475569",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

const darkButton: React.CSSProperties = {
  border: "1px solid #0f172a",
  background: "#0f172a",
  color: "#fff",
  borderRadius: 12,
  padding: "9px 12px",
  fontWeight: 800,
  cursor: "pointer",
};

const tagButton: React.CSSProperties = {
  border: "1px solid #dbe2ea",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 999,
  padding: "8px 12px",
  fontWeight: 700,
  cursor: "pointer",
};

const tag: React.CSSProperties = {
  borderRadius: 999,
  padding: "6px 10px",
  background: "#f8fafc",
  color: "#334155",
  fontSize: 12,
  fontWeight: 700,
};

const portalHeaderGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(300px, 0.9fr)",
  gap: 16,
  alignItems: "start",
};

const brandLogoShell: React.CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: 20,
  background: "linear-gradient(180deg, #ffffff 0%, #eff6ff 100%)",
  border: "1px solid #dbeafe",
  boxShadow: "0 14px 36px rgba(37, 99, 235, 0.12)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 10,
  overflow: "hidden",
};

const brandLogoImage: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
};

const brandMonogram: React.CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: 20,
  background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 28,
  fontWeight: 900,
  boxShadow: "0 14px 36px rgba(37, 99, 235, 0.18)",
};

const brandEyebrow: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#2563eb",
  letterSpacing: 0.08,
  textTransform: "uppercase",
};

const brandTitle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 34,
  lineHeight: 1.05,
  fontWeight: 900,
  color: "#0f172a",
};

const brandSubtitle: React.CSSProperties = {
  marginTop: 8,
  color: "#475569",
  fontSize: 15,
  lineHeight: 1.65,
  maxWidth: 720,
};

const brandPillRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const brandPill: React.CSSProperties = {
  borderRadius: 999,
  padding: "8px 12px",
  border: "1px solid #dbe2ea",
  background: "#fff",
  color: "#334155",
  fontSize: 12,
  fontWeight: 800,
};

const headerMetricsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const metricCard: React.CSSProperties = {
  border: "1px solid #dbeafe",
  borderRadius: 18,
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  padding: 16,
  display: "grid",
  gap: 6,
  minHeight: 120,
};

const metricLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "#64748b",
  letterSpacing: 0.08,
  textTransform: "uppercase",
};

const metricValue: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  color: "#0f172a",
};

const metricValueWide: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "#0f172a",
  lineHeight: 1.4,
  wordBreak: "break-word",
};

const metricHint: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  lineHeight: 1.5,
};

const heroGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
  alignItems: "stretch",
};

const heroCard: React.CSSProperties = {
  borderRadius: 18,
  padding: 24,
  color: "white",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  gap: 18,
};

const heroEyebrow: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0.12,
  textTransform: "uppercase",
  opacity: 0.9,
};

const heroTitle: React.CSSProperties = {
  marginTop: 12,
  fontSize: 36,
  lineHeight: 1.05,
  fontWeight: 900,
  maxWidth: 640,
};

const heroDescriptionStyle: React.CSSProperties = {
  margin: "10px 0 0",
  maxWidth: 720,
  fontSize: 15,
  lineHeight: 1.7,
  color: "rgba(255,255,255,0.86)",
};

const heroBrandBlock: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 18,
  background: "rgba(255,255,255,0.08)",
  padding: 16,
  display: "grid",
  gap: 6,
};

const heroBrandName: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
};

const heroBrandText: React.CSSProperties = {
  color: "rgba(255,255,255,0.86)",
  fontSize: 13,
  lineHeight: 1.6,
};

const heroMiniGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};

const heroMiniCard: React.CSSProperties = {
  borderRadius: 16,
  padding: 14,
  background: "rgba(255,255,255,0.12)",
  border: "1px solid rgba(255,255,255,0.14)",
  display: "grid",
  gap: 6,
};

const heroMiniLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.08,
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.72)",
};

const heroMiniValue: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#fff",
  lineHeight: 1.5,
};

const heroPillRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 18,
};

const heroPill: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 999,
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0.04,
  background: "rgba(255,255,255,0.08)",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: 0.04,
};

const guidanceBox: React.CSSProperties = {
  border: "1px solid #dbe2ea",
  borderRadius: 14,
  padding: 12,
  background: "#f8fbff",
};

const linkCta: React.CSSProperties = {
  color: "#1d4ed8",
  fontWeight: 800,
  fontSize: 13,
  textDecoration: "none",
  marginTop: 6,
  display: "inline-block",
};

const currencyRow: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "end",
  flexWrap: "wrap",
};

const contentGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.9fr) minmax(320px, 0.85fr)",
  gap: 16,
  alignItems: "start",
};

const catalogHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "end",
  flexWrap: "wrap",
  marginBottom: 14,
};

const mutedText: React.CSSProperties = {
  color: "#64748b",
  lineHeight: 1.6,
  fontSize: 14,
};

const mutedSmall: React.CSSProperties = {
  color: "#64748b",
  lineHeight: 1.5,
  fontSize: 12,
};

const filterRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 16,
};

const productGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 16,
};

const productCard: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  display: "grid",
  overflow: "hidden",
};

const productMediaShell: React.CSSProperties = {
  minHeight: 200,
  background: "linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
  overflow: "hidden",
};

const productMediaInteractive: React.CSSProperties = {
  width: "100%",
  display: "block",
  cursor: "pointer",
  position: "relative",
};

const mediaOpenButton: React.CSSProperties = {
  border: "none",
  background: "transparent",
  padding: 0,
  margin: 0,
  width: "100%",
  display: "block",
  cursor: "zoom-in",
  position: "relative",
};

const productImage: React.CSSProperties = {
  width: "100%",
  height: 220,
  objectFit: "cover",
  display: "block",
};

const productVideo: React.CSSProperties = {
  width: "100%",
  maxHeight: 260,
  display: "block",
  background: "#0f172a",
};

const productMediaEmpty: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  fontWeight: 700,
};

const mediaWatermark: React.CSSProperties = {
  position: "absolute",
  right: 12,
  bottom: 12,
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(15, 23, 42, 0.68)",
  color: "#fff",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.01em",
  pointerEvents: "none",
  maxWidth: "calc(100% - 24px)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const productBody: React.CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 16,
};

const productTopRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "start",
};

const productCategory: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#2563eb",
  textTransform: "uppercase",
  letterSpacing: 0.08,
};

const productTitle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
  color: "#0f172a",
  marginTop: 4,
};

const productSubline: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: "#64748b",
};

const productPrice: React.CSSProperties = {
  fontWeight: 900,
  color: "#0f172a",
  whiteSpace: "nowrap",
};

const productText: React.CSSProperties = {
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.6,
};

const chipRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const inventoryChip = (colors: { bg: string; fg: string }): React.CSSProperties => ({
  ...tag,
  background: colors.bg,
  color: colors.fg,
});

const specGrid: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const specRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  fontSize: 12,
  color: "#475569",
};

const specKeyStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "#0f172a",
};

const thumbRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const thumbFrame: React.CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 10,
  overflow: "hidden",
  border: "1px solid #dbe2ea",
  background: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  cursor: "pointer",
};

const thumbImage: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const videoThumbLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "#1d4ed8",
};

const productBottomRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
};

const sideTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  color: "#0f172a",
  marginBottom: 10,
};

const checkoutHint: React.CSSProperties = {
  borderRadius: 999,
  padding: "8px 12px",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontSize: 12,
  fontWeight: 800,
};

const cartRow: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 12,
  background: "#fff",
};

const cartTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
};

const cartTitle: React.CSSProperties = {
  fontWeight: 900,
  color: "#0f172a",
};

const cartBottom: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 10,
  gap: 10,
};

const cartAmount: React.CSSProperties = {
  fontWeight: 900,
  color: "#0f172a",
};

const cartTotalRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: 16,
  fontWeight: 900,
};

const trackingCard = (status: TrackingStep["status"]): React.CSSProperties => ({
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 12,
  background: status === "complete" ? "#f0fdf4" : status === "active" ? "#eff6ff" : "#fff",
});

const trackingTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
};

const trackingLabel: React.CSSProperties = {
  fontWeight: 900,
  color: "#0f172a",
};

const trackingBadge = (status: TrackingStep["status"]): React.CSSProperties => ({
  fontSize: 11,
  fontWeight: 800,
  borderRadius: 999,
  padding: "5px 9px",
  background: status === "complete" ? "#dcfce7" : status === "active" ? "#dbeafe" : "#f8fafc",
  color: status === "complete" ? "#166534" : status === "active" ? "#1d4ed8" : "#475569",
});

const trackingDetail: React.CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  color: "#475569",
  lineHeight: 1.5,
};

const statusHeaderRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
};

const statusPill: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  padding: "6px 10px",
  borderRadius: 999,
};

const detailCard: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 12,
  background: "#f8fbff",
  display: "grid",
  gap: 6,
};

const detailTitle: React.CSSProperties = {
  fontWeight: 900,
  color: "#0f172a",
};

const galleryOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.72)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 1000,
};

const galleryDialog: React.CSSProperties = {
  width: "min(1100px, 100%)",
  maxHeight: "90vh",
  overflow: "auto",
  borderRadius: 24,
  background: "#fff",
  boxShadow: "0 30px 80px rgba(15, 23, 42, 0.35)",
  padding: 20,
  display: "grid",
  gap: 16,
};

const galleryHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "start",
};

const galleryTitle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
  color: "#0f172a",
};

const galleryCloseButton: React.CSSProperties = {
  border: "1px solid #dbe2ea",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
};

const galleryStage: React.CSSProperties = {
  borderRadius: 18,
  overflow: "hidden",
  background: "#0f172a",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 320,
};

const galleryMediaStage: React.CSSProperties = {
  width: "100%",
  position: "relative",
};

const galleryImage: React.CSSProperties = {
  width: "100%",
  maxHeight: "70vh",
  objectFit: "contain",
  display: "block",
  background: "#0f172a",
};

const galleryWatermark: React.CSSProperties = {
  ...mediaWatermark,
  right: 18,
  bottom: 18,
};

const galleryVideo: React.CSSProperties = {
  width: "100%",
  maxHeight: "70vh",
  display: "block",
  background: "#0f172a",
};

const galleryThumbRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const galleryThumb: React.CSSProperties = {
  width: 88,
  height: 88,
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid #dbe2ea",
  background: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  cursor: "pointer",
};

const galleryThumbImage: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const galleryVideoLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#1d4ed8",
};
