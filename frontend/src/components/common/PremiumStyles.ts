import type { CSSProperties } from "react";

export const pageWrap: CSSProperties = {
  display: "grid",
  gap: 18,
  padding: 24,
};

export const glassCard: CSSProperties = {
  background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
  border: "1px solid rgba(226,232,240,0.95)",
  borderRadius: 22,
  boxShadow: "0 10px 35px rgba(15,23,42,0.08)",
};

export const tileStyle: CSSProperties = {
  ...glassCard,
  padding: 18,
};

export const sectionTitle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 800,
  color: "#0f172a",
};

export const softInput: CSSProperties = {
  width: "100%",
  border: "1px solid #dbe4ee",
  background: "#ffffff",
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 14,
  color: "#0f172a",
  outline: "none",
};

export const subtleLabel: CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  fontWeight: 700,
  letterSpacing: 0.2,
};

export const primaryButton: CSSProperties = {
  border: "none",
  borderRadius: 14,
  padding: "12px 16px",
  background: "linear-gradient(135deg, #111827 0%, #334155 100%)",
  color: "#ffffff",
  fontWeight: 800,
  cursor: "pointer",
};

export const secondaryButton: CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: 14,
  padding: "12px 16px",
  background: "#ffffff",
  color: "#0f172a",
  fontWeight: 800,
  cursor: "pointer",
};

export const iconButton: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  border: "1px solid #dbe4ee",
  background: "#ffffff",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};