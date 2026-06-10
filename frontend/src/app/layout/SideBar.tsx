import { NavLink, useLocation } from "react-router-dom";
import {
  FaInbox,
  FaCog,
  FaUsers,
  FaPlug,
  FaFileAlt,
  FaChartBar,
  FaHandshake,
  FaStore,
} from "react-icons/fa";
import { getAuth } from "../../utils/auth";
import { canAccessModule, type AppModuleKey } from "../../utils/access";
import { buildStorefrontPath } from "../../utils/environment";

const menu = [
  { label: "Message Monitor", path: "/monitoring", icon: <FaInbox />, moduleKey: "monitoring" as AppModuleKey },
  { label: "Client Configuration", path: "/client-config", icon: <FaCog />, moduleKey: "client_config" as AppModuleKey },
  { label: "Trading Partners", path: "/trading-partners", icon: <FaHandshake />, moduleKey: "trading_partners" as AppModuleKey },
  { label: "User Management", path: "/user-admin", icon: <FaUsers />, moduleKey: "users" as AppModuleKey },
  { label: "Connections", path: "/connections", icon: <FaPlug />, moduleKey: "connections" as AppModuleKey },
  { label: "Reports", path: "/reports", icon: <FaFileAlt />, moduleKey: "reports" as AppModuleKey },
  { label: "Analytics", path: "/analytics", icon: <FaChartBar />, moduleKey: "analytics" as AppModuleKey },
  { label: "Buyer Portal", path: "/portal", icon: <FaStore />, moduleKey: "buyer_storefront" as AppModuleKey },
];

export default function Sidebar() {
  const location = useLocation();
  const auth = getAuth();
  const visibleMenu = menu.filter((item) => canAccessModule(auth, item.moduleKey));

  return (
    <div style={sidebarStyle}>
      <div style={header}>Workspace</div>

      {visibleMenu.map((item) => {
        const resolvedPath =
          item.path === "/portal"
            ? buildStorefrontPath(auth?.client_id, auth?.environment) || item.path
            : item.path;
        const active = location.pathname.startsWith(item.path);

        return (
          <NavLink
            key={item.label}
            to={resolvedPath}
            style={{
              ...itemStyle,
              background: active ? "#eff6ff" : "#fff",
              color: active ? "#1d4ed8" : "#0f172a",
              border: active ? "1px solid #bfdbfe" : "1px solid transparent",
            }}
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        );
      })}
    </div>
  );
}

const sidebarStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  padding: 12,
};

const header: React.CSSProperties = {
  fontWeight: 800,
  marginBottom: 12,
};

const itemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px",
  borderRadius: 8,
  textDecoration: "none",
  fontWeight: 600,
  marginBottom: 6,
};
