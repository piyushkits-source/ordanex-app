export function normalizeEnvironmentLabel(value?: string | null) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "prod" || raw === "production") return "PRODUCTION";
  if (raw === "staging") return "STAGING";
  if (!raw) return "UNKNOWN";
  return raw.toUpperCase();
}

export function getFrontendEnvironmentLabel() {
  return normalizeEnvironmentLabel(import.meta.env.VITE_APP_ENV || "staging");
}

export function normalizeWorkspaceEnvironment(value?: string | null) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "PROD" || raw === "PRODUCTION") return "PROD";
  if (raw === "STAGING") return "STAGING";
  return "PROD";
}

export function workspaceEnvironmentBadge(value?: string | null) {
  return normalizeWorkspaceEnvironment(value) === "PROD" ? "PRODUCTION" : "STAGING";
}

export function storefrontEnvironmentSlug(value?: string | null) {
  return normalizeWorkspaceEnvironment(value) === "STAGING" ? "staging" : "production";
}

export function buildStorefrontPath(clientId?: string | null, environment?: string | null) {
  const normalizedClientId = String(clientId || "").trim();
  if (!normalizedClientId) return "";
  const env = storefrontEnvironmentSlug(environment);
  return env === "staging" ? `/portal/staging/${normalizedClientId}` : `/portal/${normalizedClientId}`;
}

export function buildMonitoringPath(params: {
  poId?: string | null;
  clientId?: string | null;
  environment?: string | null;
}) {
  const search = new URLSearchParams();
  const poId = String(params.poId || "").trim();
  const clientId = String(params.clientId || "").trim();
  const environment = normalizeWorkspaceEnvironment(params.environment);

  if (poId) search.set("po_id", poId);
  if (clientId) search.set("client_id", clientId);
  if (environment) search.set("environment", environment);

  const query = search.toString();
  return query ? `/monitoring?${query}` : "/monitoring";
}
