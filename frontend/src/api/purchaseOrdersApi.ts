import { apiClient } from "./apiClient";

export interface PurchaseOrderItemUpdatePayload {
  line_no: number;
  material_code?: string | null;
  description?: string | null;
  quantity?: number | null;
  uom?: string | null;
  unit_price?: number | null;
  amount?: number | null;
  delivery_date?: string | null;
  plant?: string | null;
  is_corrected?: boolean;
}

export interface PurchaseOrderUpdatePayload {
  po_number?: string | null;
  po_date?: string | null;
  sender?: string | null;
  sold_to?: string | null;
  ship_to?: string | null;
  po_validation_reason?: string | null;
  raw_text?: string | null;
  items?: PurchaseOrderItemUpdatePayload[] | null;

  // ✅ NEW
  mappings?: MappingPayload[] | null;
}

export async function updatePurchaseOrder(poId: string, payload: PurchaseOrderUpdatePayload) {
  const { data } = await apiClient.put(`/purchase-orders/${poId}`, payload);
  return data;
}

export async function reprocessPurchaseOrder(poId: string, payload?: { mock_mode?: boolean; triggered_by?: string }) {
  const { data } = await apiClient.post(`/purchase-orders/${poId}/reprocess`, payload || {});
  return data;
}

export async function archivePurchaseOrder(poId: string, payload: { reason: string; comment?: string }) {
  const { data } = await apiClient.post(`/purchase-orders/${poId}/archive`, payload);
  return data;
}

export interface MappingPayload {
  key: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
    page?: number;
  };
}


