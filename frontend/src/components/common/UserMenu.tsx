import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  FaUserCircle,
  FaChevronDown,
  FaCog,
  FaUsers,
  FaPlug,
  FaSlidersH,
  FaFileAlt,
  FaChartBar,
  FaSignOutAlt,
  FaHome,
} from "react-icons/fa";
import { clearAuth, getAuth } from "../../utils/auth";

const menuItems = [
  { label: "Message Monitor", path: "/monitoring", icon: <FaHome /> },
  { label: "Client Configuration", path: "/client-config", icon: <FaCog /> },
  { label: "Trading Partner", path: "/client-config", icon: <FaCog /> },
  { label: "User Management", path: "/users", icon: <FaUsers /> },
  { label: "Reports", path: "/reports", icon: <FaFileAlt /> },
  { label: "Analytics", path: "/analytics", icon: <FaChartBar /> },
];

export default function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const auth = getAuth();

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const userDisplayName = useMemo(() => {
    if (auth?.email) return auth.email.split("@")[0];
    return "User";
  }, [auth]);

  function handleLogout() {
    clearAuth();
    setOpen(false);
    navigate("/login", { replace: true });
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={triggerButton}>
        <FaUserCircle size={28} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.1 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{userDisplayName}</span>
          <span style={{ fontSize: 11, opacity: 0.8 }}>{auth?.role || "Authenticated User"}</span>
        </div>
        <FaChevronDown size={12} style={{ opacity: 0.85 }} />
      </button>

      {open ? (
        <div style={menuPanel}>
          <div style={menuHeader}>
            <div style={menuHeaderName}>{auth?.email || "Signed in"}</div>
            <div style={menuHeaderRole}>{auth?.role || ""}</div>
          </div>

          <div style={{ display: "grid", gap: 4 }}>
            {menuItems.map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.label}
                  to={item.path}
                  onClick={() => setOpen(false)}
                  style={{
                    ...menuItemStyle,
                    background: active ? "#eff6ff" : "transparent",
                    color: active ? "#1d4ed8" : "#0f172a",
                    border: active ? "1px solid #bfdbfe" : "1px solid transparent",
                  }}
                >
                  <span
                    style={{
                      color: active ? "#1d4ed8" : "#64748b",
                      width: 16,
                      display: "inline-flex",
                      justifyContent: "center",
                    }}
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div style={menuFooter}>
            <button type="button" onClick={handleLogout} style={logoutButton}>
              <FaSignOutAlt size={13} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const triggerButton: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  border: "1px solid rgba(255,255,255,0.35)",
  background: "rgba(255,255,255,0.14)",
  color: "#fff",
  borderRadius: 999,
  padding: "8px 14px",
  cursor: "pointer",
  fontWeight: 700,
  minHeight: 48,
};

const menuPanel: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: "calc(100% + 10px)",
  width: 280,
  background: "#fff",
  border: "1px solid #dbe4ee",
  borderRadius: 14,
  boxShadow: "0 14px 30px rgba(15,23,42,0.15)",
  padding: 10,
  zIndex: 30,
};

const menuHeader: React.CSSProperties = {
  padding: "10px 12px 12px 12px",
  borderBottom: "1px solid #eef2f7",
  marginBottom: 8,
};

const menuHeaderName: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "#0f172a",
  wordBreak: "break-word",
};

const menuHeaderRole: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginTop: 4,
  textTransform: "capitalize",
};

const menuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "11px 10px",
  textDecoration: "none",
  borderRadius: 10,
  fontWeight: 600,
  fontSize: 13,
};

const menuFooter: React.CSSProperties = {
  borderTop: "1px solid #eef2f7",
  marginTop: 8,
  paddingTop: 8,
};

const logoutButton: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 10,
  border: "none",
  background: "transparent",
  color: "#b91c1c",
  borderRadius: 10,
  padding: "11px 10px",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
  textAlign: "left",
};