import type { AuthUser } from "./auth";

export type AppModuleKey =
  | "monitoring"
  | "client_config"
  | "trading_partners"
  | "users"
  | "connections"
  | "business_rules"
  | "reports"
  | "analytics"
  | "bulk_onboarding"
  | "agentic_support"
  | "buyer_storefront";

const ROLE_ACCESS: Record<string, AppModuleKey[]> = {
  super_admin: [
    "monitoring",
    "client_config",
    "trading_partners",
    "users",
    "connections",
    "business_rules",
    "reports",
    "analytics",
    "bulk_onboarding",
    "agentic_support",
    "buyer_storefront",
  ],
  client_admin: [
    "trading_partners",
    "users",
    "reports",
    "analytics",
    "buyer_storefront",
  ],
  it_admin: [
    "monitoring",
    "business_rules",
  ],
  business_user: [
    "monitoring",
  ],
};

// Subscription scaffolding is centralized here so views/sessions can be
// managed consistently once plan-to-feature mapping is finalized.
const SUBSCRIPTION_ACCESS: Record<string, AppModuleKey[]> = {
  basic: ["monitoring"],
  standard: ["monitoring", "business_rules"],
  enterprise: [
    "monitoring",
    "business_rules",
    "trading_partners",
    "users",
    "reports",
    "analytics",
    "buyer_storefront",
  ],
  premium: [
    "monitoring",
    "business_rules",
    "trading_partners",
    "users",
    "reports",
    "analytics",
    "bulk_onboarding",
    "agentic_support",
    "buyer_storefront",
  ],
};

export function normalizeRole(role?: string | null): string {
  return String(role || "").trim().toLowerCase();
}

export function normalizeSubscription(subscription?: string | null): string {
  return String(subscription || "").trim().toLowerCase();
}

export function canAccessModule(auth: AuthUser | null | undefined, moduleKey: AppModuleKey): boolean {
  if (!auth) return false;

  const role = normalizeRole(auth.role);
  const subscription = normalizeSubscription(auth.subscription_type);

  const roleAllowed = (ROLE_ACCESS[role] || []).includes(moduleKey);
  if (!roleAllowed) return false;

  if (role === "super_admin") return true;

  const featureFlags = Array.isArray(auth.feature_flags) ? auth.feature_flags.map((flag) => String(flag || "").trim().toLowerCase()) : [];
  const disabledFeatureFlags = Array.isArray((auth as any).disabled_feature_flags)
    ? (auth as any).disabled_feature_flags.map((flag: string) => String(flag || "").trim().toLowerCase())
    : [];
  if (disabledFeatureFlags.includes(moduleKey)) return false;
  if (featureFlags.includes(moduleKey)) return true;

  if (!subscription) return true;
  const subscriptionAllowed = (SUBSCRIPTION_ACCESS[subscription] || []).includes(moduleKey);
  return subscriptionAllowed;
}

export function getAccessibleModules(auth: AuthUser | null | undefined): AppModuleKey[] {
  if (!auth) return [];
  const modules = ROLE_ACCESS[normalizeRole(auth.role)] || [];
  return modules.filter((moduleKey) =>
    canAccessModule(auth, moduleKey)
  );
}

export function getDefaultRouteForAuth(auth: AuthUser | null | undefined): string {
  if (!auth) return "/login";
  const preferredOrder: Array<{ moduleKey: AppModuleKey; path: string }> = [
    { moduleKey: "monitoring", path: "/monitoring" },
    { moduleKey: "client_config", path: "/client-config" },
    { moduleKey: "trading_partners", path: "/trading-partners" },
    { moduleKey: "reports", path: "/reports" },
    { moduleKey: "analytics", path: "/analytics" },
    { moduleKey: "users", path: "/users" },
    { moduleKey: "business_rules", path: "/business-rules" },
    { moduleKey: "connections", path: "/connections" },
  ];

  return preferredOrder.find((item) => canAccessModule(auth, item.moduleKey))?.path || "/monitoring";
}
