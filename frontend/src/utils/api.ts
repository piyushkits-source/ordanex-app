import { API_BASE } from "../api/apiClient";
import { getAccessToken, getAuthHeaders, redirectToLogin } from "./auth";

type ApiOptions = RequestInit & {
  skipAuthRedirect?: boolean;
};

function getSelectedEnvironment(): string {
  try {
    const raw = localStorage.getItem("ordanet_app_scope");
    if (!raw) return "PROD";
    const parsed = JSON.parse(raw);
    return String(parsed?.environment || "PROD").toUpperCase();
  } catch {
    return "PROD";
  }
}

function normalizeApiUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (!API_BASE) return url;
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return `${API_BASE}/${url}`;
}

function pathFromUrl(url: string): string {
  try {
    return new URL(url, API_BASE || window.location.origin).pathname;
  } catch {
    return url;
  }
}

function isProtectedConfigUrl(url: string): boolean {
  const path = pathFromUrl(url);
  return (
    path.startsWith("/client-config") ||
    path.startsWith("/trading-partners") ||
    path.startsWith("/trading-partners-agentic")
  );
}

export async function apiFetch(url: string, options: ApiOptions = {}) {
  const { skipAuthRedirect, headers, ...rest } = options;
  const method = String(rest.method || "GET").toUpperCase();
  const requestUrl = normalizeApiUrl(url);

  if (!["GET", "HEAD", "OPTIONS"].includes(method) && isProtectedConfigUrl(url) && getSelectedEnvironment() === "PROD") {
    throw new Error("Configuration changes are blocked in Production. Switch to Staging to create, edit, or update configuration.");
  }

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      ...rest,
      headers: getAuthHeaders(headers),
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Unable to reach the backend. Please refresh and try again.";
    throw new Error(message);
  }

  if (response.status === 401 && !skipAuthRedirect) {
    redirectToLogin();
    throw new Error("Session expired. Please sign in again.");
  }

  return response;
}

export async function parseApiError(res: Response): Promise<string> {
  try {
    const data = await res.json();

    if (typeof data?.detail === "string") return data.detail;
    if (typeof data?.message === "string") return data.message;
    if (Array.isArray(data?.detail)) {
      return data.detail.map((x: any) => x?.msg || JSON.stringify(x)).join(" | ");
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
