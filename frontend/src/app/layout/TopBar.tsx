import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import UserMenu from "../../components/common/UserMenu";
import {
  buildStorefrontPath,
  getFrontendEnvironmentLabel,
  workspaceEnvironmentBadge,
} from "../../utils/environment";
import { apiFetch } from "../../utils/api";
import { useAppScope } from "../../context/AppScopeContext";
import { getAuth } from "../../utils/auth";
import { canAccessModule } from "../../utils/access";

function getPageTitle(pathname: string) {
  if (pathname.startsWith("/client-config"))     return "Client Configuration";
  if (pathname.startsWith("/monitoring"))        return "Message Monitor";
  if (pathname.startsWith("/trading-partners"))  return "Trading Partners";
  if (pathname.startsWith("/user-admin"))        return "User Management";
  if (pathname.startsWith("/users"))             return "User Management";
  if (pathname.startsWith("/connections"))       return "Connections";
  if (pathname.startsWith("/business-rules"))    return "Business Rules";
  if (pathname.startsWith("/reports"))           return "Reports";
  if (pathname.startsWith("/analytics"))         return "Analytics";
  return "Ordanex Workspace";
}

export default function TopBar() {
  const location = useLocation();
  const title = getPageTitle(location.pathname);
  const { scope } = useAppScope();
  const auth = getAuth();
  const navigate = useNavigate();
  const [environment, setEnvironment] = useState(getFrontendEnvironmentLabel());
  const activeClientId = scope.clientId || auth?.client_id;
  const storefrontPath = canAccessModule(auth, "buyer_storefront")
    ? buildStorefrontPath(activeClientId, scope.environment || auth?.environment || environment)
    : "";

  useEffect(() => {
    if (scope.environment) {
      setEnvironment(workspaceEnvironmentBadge(scope.environment));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch("/system/environment", { method: "GET" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.environment) {
          setEnvironment(String(data.environment).toUpperCase());
        }
      } catch {
        // keep frontend label fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope.environment]);

  return (
    <div style={topBar}>
      <div style={leftSection}>
        <div style={logo}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="2" width="9" height="9" rx="2" fill="rgba(255,255,255,0.9)" />
            <rect x="13" y="2" width="9" height="9" rx="2" fill="rgba(255,255,255,0.6)" />
            <rect x="2" y="13" width="9" height="9" rx="2" fill="rgba(255,255,255,0.6)" />
            <rect x="13" y="13" width="9" height="9" rx="2" fill="rgba(255,255,255,0.9)" />
          </svg>
        </div>

        <div>
          <div style={brand}>Ordanex</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            <div style={subtitle}>{title}</div>
            <div
              style={{
                ...envBadge,
                background: environment === "PRODUCTION" ? "rgba(239,68,68,0.18)" : "rgba(16,185,129,0.18)",
                borderColor: environment === "PRODUCTION" ? "rgba(254,202,202,0.55)" : "rgba(167,243,208,0.55)",
              }}
            >
              {environment}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {storefrontPath ? (
          <button
            type="button"
            onClick={() => navigate(storefrontPath)}
            style={{
              border: "1px solid rgba(255,255,255,0.35)",
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
              borderRadius: 999,
              padding: "8px 14px",
              cursor: "pointer",
              fontWeight: 800,
              minHeight: 48,
              fontSize: 13,
            }}
          >
            Open storefront
          </button>
        ) : null}
        <UserMenu />
      </div>
    </div>
  );
}

const topBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  background: "linear-gradient(90deg, #0b5fff, #1d4ed8)",
  borderRadius: 16,
  padding: "14px 18px",
  color: "#fff",
};

const leftSection: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const logo: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 12,
  background: "rgba(255,255,255,0.15)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const brand: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  letterSpacing: "-0.5px",
};

const subtitle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.85,
};

const envBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid rgba(255,255,255,0.45)",
  color: "#fff",
  borderRadius: 999,
  padding: "3px 10px",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 0.8,
};
