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

export async function uploadPortalFile(
  request: PortalFileUploadRequest,
): Promise<PortalFileUploadResult> {
  const form = buildUploadFormData(request);

  try {
    const response = await fetch("/files/upload", {
      method: "POST",
      body: form,
    });

    if (response.ok) {
      let body: any = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const normalized = normalizeRemoteUploadResponse(body, request.file.name);
      if (normalized) return normalized;
    }
  } catch {
    // Safe fallback below keeps the UI usable before the backend upload service is live.
  }

  return {
    fileName: request.file.name,
    fileDataUrl: await readFileAsDataUrl(request.file),
    storageMode: "inline",
  };
}
