export type AuthUser = {
  access_token: string;
  token_type: string;
  user_id: string;
  email: string;
  role: string;
  client_id?: string | null;
};

const AUTH_STORAGE_KEY = "ordanex_auth";

export function saveAuth(auth: AuthUser) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
}

export function getAuth(): AuthUser | null {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    clearAuth();
    return null;
  }
}

export function getAccessToken(): string | null {
  return getAuth()?.access_token || null;
}

export function getCurrentRole(): string | null {
  return getAuth()?.role || null;
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

export function clearAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function getAuthHeaders(extra?: HeadersInit): HeadersInit {
  const token = getAccessToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}

export function getPostLoginPath(role?: string | null) {
  if (role === "super_admin") return "/monitoring";
  if (role === "client_admin") return "/client-config";
  return "/monitoring";
}
