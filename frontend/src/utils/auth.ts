import { getDefaultRouteForAuth } from "./access";

export type AuthUser = {
  access_token: string;
  token_type: string;
  user_id: string;
  email: string;
  role: string;
  client_id?: string | null;
  environment?: string | null;
  subscription_type?: string | null;
  client_name?: string | null;
  feature_flags?: string[];
  disabled_feature_flags?: string[];
  disabled_feature_flags?: string[];
};

const AUTH_STORAGE_KEY = "ordanex_auth";
let bootLogoutApplied = false;

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

export function getCurrentSubscriptionType(): string | null {
  return getAuth()?.subscription_type || null;
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

export function clearAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function clearAuthOnAppBoot() {
  if (bootLogoutApplied) return;
  bootLogoutApplied = true;
  clearAuth();
}

export function redirectToLogin(nextPath?: string | null) {
  clearAuth();
  const currentPath =
    nextPath ||
    (typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/");
  const redirect = `/login?next=${encodeURIComponent(currentPath)}`;
  if (typeof window !== "undefined") {
    window.location.replace(redirect);
  }
}

export async function verifyCurrentSession(): Promise<boolean> {
  const token = getAccessToken();
  if (!token) return false;

  try {
    const response = await fetch("/auth/me", {
      method: "GET",
      headers: getAuthHeaders(),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
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
  const auth = getAuth();
  const merged = auth
    ? { ...auth, role: role ?? auth.role }
      : role
      ? ({ role } as AuthUser)
      : null;
  if (!merged) return "/monitoring";
  return getDefaultRouteForAuth(merged);
}
