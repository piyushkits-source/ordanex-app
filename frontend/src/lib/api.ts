import type { Environment, PurchaseOrder, PoFileInfoResponse, PoLog, EmailHistoryRow } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

export const api = {
  baseUrl: API_BASE_URL,
  listPurchaseOrders(environment: Environment) {
    return apiGet<PurchaseOrder[]>(`/purchase-orders/?environment=${encodeURIComponent(environment)}`);
  },
  getPurchaseOrder(poId: string) {
    return apiGet<PurchaseOrder>(`/purchase-orders/${poId}`);
  },
  getPurchaseOrderXml(poId: string) {
    return apiGet<{po_id:string;po_number?:string;xml_payload?:string}>(`/purchase-orders/${poId}/xml`);
  },
  getPurchaseOrderLogs(poId: string) {
    return apiGet<PoLog[]>(`/purchase-orders/${poId}/logs`);
  },
  getPurchaseOrderEmailHistory(poId: string) {
    return apiGet<EmailHistoryRow[]>(`/purchase-orders/${poId}/email-history`);
  },
  getFileByPo(poId: string) {
    return apiGet<PoFileInfoResponse>(`/files/by-po/${poId}`);
  },
  reprocessPurchaseOrder(poId: string) {
    return apiPost(`/purchase-orders/${poId}/reprocess`, {mock_mode:false});
  },
};
