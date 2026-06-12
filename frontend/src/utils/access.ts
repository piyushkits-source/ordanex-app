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
    "monitoring",
    "client_config",
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

// Subscription access is centralized here so each plan has a visible
// product surface, not just a pricing-page distinction.
const SUBSCRIPTION_ACCESS: Record<string, AppModuleKey[]> = {
  basic: [
    "monitoring",
    "client_config",
    "users",
    "buyer_storefront",
  ],
  standard: [
    "monitoring",
    "client_config",
    "trading_partners",
    "users",
    "reports",
    "analytics",
    "buyer_storefront",
  ],
  enterprise: [
    "monitoring",
    "client_config",
    "trading_partners",
    "users",
    "connections",
    "business_rules",
    "reports",
    "analytics",
    "buyer_storefront",
  ],
  premium: [
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
};

const MODULE_LABELS: Record<AppModuleKey, string> = {
  monitoring: "Message Monitor",
  client_config: "Client Configuration",
  trading_partners: "Trading Partners",
  users: "User Management",
  connections: "Connections",
  business_rules: "Business Rules",
  reports: "Reports",
  analytics: "Analytics",
  bulk_onboarding: "Bulk Onboarding",
  agentic_support: "Agentic Support",
  buyer_storefront: "Buyer Storefront",
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

export function getSubscriptionFeatureLabels(subscription?: string | null): string[] {
  const normalized = normalizeSubscription(subscription);
  const modules = SUBSCRIPTION_ACCESS[normalized] || [];
  return modules.map((moduleKey) => MODULE_LABELS[moduleKey]);
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
