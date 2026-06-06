import { apiClient } from "./apiClient";

export type BuyerPortalMediaItem = {
  kind?: "image" | "video";
  url: string;
  label?: string | null;
  poster_url?: string | null;
};

export interface BuyerPortalCatalogItem {
  sku: string;
  name: string;
  description?: string | null;
  details?: string | null;
  category?: string | null;
  brand?: string | null;
  unit_price: number;
  currency?: string;
  uom?: string;
  image_url?: string | null;
  video_url?: string | null;
  media?: BuyerPortalMediaItem[] | null;
  stock_status?: string | null;
  lead_time?: string | null;
  min_order_qty?: number | null;
  moq_uom?: string | null;
  payment_terms?: string | null;
  supplier_name?: string | null;
  specifications?: Record<string, string> | null;
}

export interface BuyerPortalOrderItem {
  sku: string;
  name?: string | null;
  description?: string | null;
  quantity: number;
  unit_price: number;
  uom?: string;
  delivery_date?: string | null;
}

export interface BuyerPortalCommerceSettings {
  seller_mode?: "ERP_INTEGRATED" | "STANDALONE_COMMERCE";
  order_flow_mode?: "ERP_ORCHESTRATED" | "ORDANEX_MANAGED";
  buyer_tracking_mode?: "LIVE_ERP" | "PORTAL_UPDATES";
  supplier_display_name?: string;
}

export interface BuyerPortalPaymentSettings {
  enabled?: boolean;
  mode?: "INVOICE_LATER" | "OFFLINE_TRANSFER" | "PAYMENT_LINK";
  provider_name?: string;
  accepted_methods?: string[];
  payment_terms?: string;
  instructions?: string;
  payment_link_url?: string;
  payment_link_label?: string;
  proof_of_payment_instructions?: string;
}

export interface BuyerPortalExperienceSettings {
  show_product_specs?: boolean;
  show_inventory_status?: boolean;
  show_checkout_promises?: boolean;
}

export interface BuyerPortalSettings {
  client_id?: string;
  branding?: {
    storefront_title?: string;
    hero_headline?: string;
    hero_description?: string;
    support_email?: string;
    logo_url?: string;
    accent_color?: string;
    banner_text?: string;
  };
  catalog?: {
    source_mode?: string;
    title?: string;
    description?: string;
    items?: BuyerPortalCatalogItem[];
  };
  commerce?: BuyerPortalCommerceSettings;
  payments?: BuyerPortalPaymentSettings;
  experience?: BuyerPortalExperienceSettings;
  [key: string]: any;
}

export interface BuyerPortalOrderCreate {
  client_id: string;
  buyer_name: string;
  buyer_email: string;
  company_name?: string | null;
  sold_to?: string | null;
  ship_to?: string | null;
  ship_to_name?: string | null;
  ship_to_address?: string | null;
  currency?: string | null;
  notes?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_proof_name?: string | null;
  payment_proof_url?: string | null;
  payment_proof_storage_key?: string | null;
  payment_proof_data_url?: string | null;
  items: BuyerPortalOrderItem[];
}

export interface BuyerPortalTrackingStep {
  key: string;
  label: string;
  status: "complete" | "active" | "pending";
  detail: string;
}

export interface BuyerPortalInvoiceDetails {
  invoice_number?: string | null;
  invoice_date?: string | null;
  invoice_amount?: number | null;
  currency?: string | null;
  due_date?: string | null;
  payment_status?: string | null;
  invoice_url?: string | null;
  invoice_file_name?: string | null;
  invoice_storage_key?: string | null;
  invoice_file_data_url?: string | null;
  invoice_notes?: string | null;
}

export interface BuyerPortalShipmentDetails {
  shipment_number?: string | null;
  shipment_status?: string | null;
  carrier?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  shipment_document_name?: string | null;
  shipment_document_url?: string | null;
  shipment_document_storage_key?: string | null;
  shipment_document_data_url?: string | null;
  ship_date?: string | null;
  estimated_delivery_date?: string | null;
  delivered_date?: string | null;
  shipment_notes?: string | null;
}

export interface BuyerPortalPaymentDetails {
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_status?: string | null;
  payment_proof_name?: string | null;
  payment_proof_url?: string | null;
  payment_proof_storage_key?: string | null;
  payment_proof_data_url?: string | null;
  payment_proof_uploaded_at?: string | null;
}

export interface BuyerPortalOrder {
  po_id: string;
  po_number?: string | null;
  supplier_name?: string | null;
  client_id: string;
  status?: string | null;
  dispatch_status?: string | null;
  ack_status?: string | null;
  processed_at?: string | null;
  po_validation_reason?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_status?: string | null;
  payment_proof_name?: string | null;
  payment_proof_url?: string | null;
  payment_proof_storage_key?: string | null;
  payment_proof_data_url?: string | null;
  payment?: BuyerPortalPaymentDetails | null;
  invoice?: BuyerPortalInvoiceDetails | null;
  shipment?: BuyerPortalShipmentDetails | null;
  tracking_steps?: BuyerPortalTrackingStep[];
  [key: string]: any;
}

export interface BuyerPortalCommerceUpdate {
  payment?: BuyerPortalPaymentDetails | null;
  invoice?: BuyerPortalInvoiceDetails | null;
  shipment?: BuyerPortalShipmentDetails | null;
}

export async function fetchBuyerAccess(clientId: string, buyerEmail?: string) {
  const { data } = await apiClient.get("/buyer-portal/access", {
    params: { client_id: clientId, buyer_email: buyerEmail || undefined },
  });
  return data as {
    client_id: string;
    subscription_type?: string | null;
    buyer_storefront: boolean;
    buyer_storefront_source?: string | null;
    buyer_email?: string | null;
    buyer_approved?: boolean;
    approval_required?: boolean;
    access_message?: string | null;
    approved_buyer_count?: number;
  };
}

export async function fetchBuyerCatalog(clientId: string, buyerEmail?: string) {
  const { data } = await apiClient.get("/buyer-portal/catalog", {
    params: { client_id: clientId, buyer_email: buyerEmail || undefined },
  });
  return data as BuyerPortalCatalogItem[];
}

export async function fetchBuyerOrders(clientId: string, buyerEmail?: string) {
  const { data } = await apiClient.get("/buyer-portal/orders", {
    params: { client_id: clientId, buyer_email: buyerEmail || undefined },
  });
  return data as BuyerPortalOrder[];
}

export async function submitBuyerOrder(payload: BuyerPortalOrderCreate) {
  const { data } = await apiClient.post("/buyer-portal/orders", payload);
  return data as BuyerPortalOrder;
}

export async function fetchBuyerOrder(poId: string) {
  const { data } = await apiClient.get(`/buyer-portal/orders/${poId}`);
  return data as BuyerPortalOrder;
}

export async function fetchBuyerPortalSettings(clientId: string) {
  const { data } = await apiClient.get("/buyer-portal/settings", {
    params: { client_id: clientId },
  });
  return data as BuyerPortalSettings;
}

export async function updateBuyerPortalCommerce(
  poId: string,
  payload: BuyerPortalCommerceUpdate,
) {
  const { data } = await apiClient.patch(`/buyer-portal/orders/${poId}/commerce`, payload);
  return data as BuyerPortalOrder;
}
