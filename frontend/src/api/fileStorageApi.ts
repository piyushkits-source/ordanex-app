import { API_BASE } from "./apiClient";
import { getAccessToken } from "../utils/auth";

export type PortalFileUploadScope =
  | "catalog-media"
  | "payment-proof"
  | "invoice-document"
  | "shipment-document";

export type PortalFileUploadResult = {
  fileName: string;
  fileUrl?: string | null;
  fileDataUrl?: string | null;
  storageKey?: string | null;
  storageMode: "remote" | "inline";
};

export type PortalFileUploadRequest = {
  file: File;
  clientId?: string | null;
  orderId?: string | null;
  productSku?: string | null;
  scope: PortalFileUploadScope;
};

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function buildUploadFormData(request: PortalFileUploadRequest) {
  const form = new FormData();
  form.append("file", request.file);
  form.append("scope", request.scope);
  if (request.clientId) form.append("client_id", request.clientId);
  if (request.orderId) form.append("order_id", request.orderId);
  if (request.productSku) form.append("product_sku", request.productSku);
  return form;
}

function normalizeRemoteUploadResponse(
  body: any,
  fallbackName: string,
): PortalFileUploadResult | null {
  const fileUrl =
    body?.file_url || body?.url || body?.document_url || body?.public_url || null;
  if (!fileUrl) return null;
  return {
    fileName: body?.file_name || body?.name || fallbackName,
    fileUrl,
    storageKey: body?.storage_key || body?.key || null,
    storageMode: "remote",
  };
}

async function parseUploadError(response: Response) {
  try {
    const body = await response.json();
    const detail = body?.detail || body?.message || body?.error;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
  } catch {}

  try {
    const text = await response.text();
    if (text.trim()) return text.trim();
  } catch {}

  return `Upload failed with status ${response.status}.`;
}

export async function uploadPortalFile(
  request: PortalFileUploadRequest,
): Promise<PortalFileUploadResult> {
  const form = buildUploadFormData(request);

  try {
    const token = getAccessToken();
    const response = await fetch(`${API_BASE}/files/upload`, {
      method: "POST",
      body: form,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(await parseUploadError(response));
    }

    let body: any = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    const normalized = normalizeRemoteUploadResponse(body, request.file.name);
    if (!normalized) {
      throw new Error("Upload completed but Ordanex did not return a reusable file URL.");
    }
    return normalized;
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error;
    }
    // Safe fallback below keeps the UI usable when the upload service is temporarily unreachable.
  }

  return {
    fileName: request.file.name,
    fileDataUrl: await readFileAsDataUrl(request.file),
    storageMode: "inline",
  };
}
