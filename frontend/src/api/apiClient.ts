import axios from "axios";

function inferApiBase() {
  if (typeof window === "undefined") return "";
  const { hostname, protocol } = window.location;
  if (!hostname) return "";
  if (hostname === "app.ordanex.ai" || hostname.endsWith(".ordanex-app.pages.dev")) {
    return "https://api.ordanex.ai";
  }
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "";
  }
  if (hostname.startsWith("app.")) {
    return `${protocol}//${hostname.replace(/^app\./, "api.")}`;
  }
  return "";
}

export const API_BASE = import.meta.env.VITE_API_BASE || inferApiBase();

export const apiClient = axios.create({ baseURL: API_BASE });

apiClient.interceptors.request.use((config) => {
  const token = window.localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function absoluteFileUrl(url?: string | null): string {
  if (!url) return "";
  if (
    url.startsWith("http://")
    || url.startsWith("https://")
    || url.startsWith("data:")
    || url.startsWith("blob:")
  ) {
    return url;
  }
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}
