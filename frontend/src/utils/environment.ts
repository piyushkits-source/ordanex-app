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
