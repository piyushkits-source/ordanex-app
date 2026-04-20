import { NavLink, useLocation } from "react-router-dom";
import {
  FaInbox,
  FaCog,
  FaUsers,
  FaPlug,
  FaSlidersH,
  FaFileAlt,
  FaChartBar,
  FaHandshake,
} from "react-icons/fa";

const menu = [
  { label: "Message Monitor",      path: "/monitoring",       icon: <FaInbox /> },
  { label: "Client Configuration", path: "/client-config",    icon: <FaCog /> },
  { label: "Trading Partners",     path: "/trading-partners", icon: <FaHandshake /> },
  { label: "User Management",      path: "/user-admin",       icon: <FaUsers /> },
  { label: "Connections",          path: "/connections",       icon: <FaPlug /> },
  { label: "Business Rules",       path: "/business-rules",   icon: <FaSlidersH /> },
  { label: "Reports",              path: "/reports",           icon: <FaFileAlt /> },
  { label: "Analytics",            path: "/analytics",         icon: <FaChartBar /> },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <div style={sidebarStyle}>
      <div style={header}>Workspace</div>

      {menu.map((item) => {
        const active = location.pathname.startsWith(item.path);

        return (
          <NavLink
            key={item.label}
            to={item.path}
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
