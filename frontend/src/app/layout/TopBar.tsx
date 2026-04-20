import { useLocation } from "react-router-dom";
import UserMenu from "../../components/common/UserMenu";

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
          <div style={subtitle}>{title}</div>
        </div>
      </div>

      <UserMenu />
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
