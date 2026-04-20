import React from "react";
import {
  FaBuilding,
  FaIdCard,
  FaPlug,
  FaMapMarkedAlt,
  FaBalanceScale,
  FaProjectDiagram,
  FaLayerGroup,
  FaFileCode,
  FaBell,
  FaUpload,
  FaRobot,
  FaHistory,
  FaBoxOpen,
} from "react-icons/fa";

type SectionKey =
  | "master"
  | "profile"
  | "connections"
  | "address"
  | "uom"
  | "uom-rules"
  | "business-rules"
  | "mapping"
  | "mapping-profiles"
  | "parser-profiles"
  | "notifications"
  | "bulk"
  | "ai"
  | "audit";

type MenuGroup = {
  title: string;
  items: {
    key: SectionKey;
    label: string;
    icon: React.ReactNode;
  }[];
};

const groups: MenuGroup[] = [
  {
    title: "Configuration",
    items: [
      { key: "master", label: "Master", icon: <FaBuilding /> },
      { key: "profile", label: "Profile", icon: <FaIdCard /> },
      { key: "connections", label: "Connections", icon: <FaPlug /> },
      { key: "address", label: "Address", icon: <FaMapMarkedAlt /> },
    ],
  },
  {
    title: "Processing",
    items: [
      { key: "uom", label: "UOM", icon: <FaBalanceScale /> },
      { key: "uom-rules", label: "UOM Rules", icon: <FaProjectDiagram /> },
      { key: "business-rules", label: "Business Rules", icon: <FaProjectDiagram /> },
      { key: "mapping", label: "Mapping", icon: <FaLayerGroup /> },
      { key: "mapping-profiles", label: "Mapping Profiles", icon: <FaLayerGroup /> },
      { key: "parser-profiles", label: "Parser Profiles", icon: <FaFileCode /> },
    ],
  },
  {
    title: "Operations",
    items: [
      { key: "notifications", label: "Notifications", icon: <FaBell /> },
      { key: "bulk", label: "Bulk Upload", icon: <FaUpload /> },
      { key: "ai", label: "AI Onboarding", icon: <FaRobot /> },
      { key: "audit", label: "Audit", icon: <FaHistory /> },
    ],
  },
];

export default function TradingPartnerSectionMenu({
  activeSection,
  disabled,
  onSelect,
}: {
  activeSection: SectionKey;
  disabled?: boolean;
  onSelect: (key: SectionKey) => void;
}) {
  return (
    <div style={wrapper}>
      {groups.map((group) => (
        <div key={group.title} style={groupCard}>
          <div style={groupHeader}>
            <span style={groupHeaderIcon}>
              <FaBoxOpen />
            </span>
            <span>{group.title}</span>
          </div>

          <div style={menuContainer}>
            {group.items.map((s) => {
              const isActive = s.key === activeSection;

              return (
                <button
                  key={s.key}
                  disabled={disabled}
                  onClick={() => onSelect(s.key)}
                  style={{
                    ...menuItem,
                    background: isActive ? "#eff6ff" : "#fff",
                    color: isActive ? "#1d4ed8" : "#475569",
                    border: isActive ? "1px solid #3b82f6" : "1px solid #e5e7eb",
                    fontWeight: isActive ? 700 : 600,
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.6 : 1,
                    boxShadow: isActive ? "0 1px 4px rgba(59,130,246,0.12)" : "none",
                  }}
                >
                  <span
                    style={{
                      ...iconStyle,
                      color: isActive ? "#1d4ed8" : "#64748b",
                    }}
                  >
                    {s.icon}
                  </span>
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const wrapper: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const groupCard: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 12,
  background: "#fff",
};

const groupHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  fontWeight: 800,
  color: "#334155",
  marginBottom: 10,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const groupHeaderIcon: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#64748b",
  fontSize: 12,
};

const menuContainer: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const menuItem: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 14px",
  borderRadius: 999,
  fontSize: 13,
  background: "#fff",
};

const iconStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
};