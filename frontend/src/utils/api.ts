import { clearAuth, getAuthHeaders } from "./auth";

type ApiOptions = RequestInit & {
  skipAuthRedirect?: boolean;
};

export async function apiFetch(url: string, options: ApiOptions = {}) {
  const { skipAuthRedirect, headers, ...rest } = options;

  const response = await fetch(url, {
    ...rest,
    headers: getAuthHeaders(headers),
  });

  if (response.status === 401 && !skipAuthRedirect) {
    clearAuth();
    const currentPath = window.location.pathname + window.location.search;
    const redirect = `/login?next=${encodeURIComponent(currentPath)}`;
    window.location.href = redirect;
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