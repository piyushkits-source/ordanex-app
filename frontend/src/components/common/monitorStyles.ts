import type { CSSProperties } from "react";

export const pageShell: CSSProperties = { maxWidth: 1920, margin: "0 auto", padding: 18 };
export const panelShell: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d9e1ea",
  borderRadius: 18,
  overflow: "hidden",
  boxShadow: "0 18px 40px rgba(15,23,42,0.06)",
};
export const sectionDivider: CSSProperties = { borderTop: "1px solid #dbe4ee" };
export const topBlueSection: CSSProperties = {
  background: "linear-gradient(135deg, #1787cf 0%, #0964a8 100%)",
  color: "#ffffff",
};
export const whiteInput: CSSProperties = {
  width: "100%",
  border: "1px solid rgba(255,255,255,0.35)",
  background: "#ffffff",
  borderRadius: 12,
  padding: "11px 14px",
  color: "#0f172a",
  fontSize: 14,
  lineHeight: 1.2,
  boxSizing: "border-box",
};
export const whiteSelect: CSSProperties = {
  width: "100%",
  border: "1px solid #bfd0e2",
  background: "#ffffff",
  borderRadius: 10,
  padding: "11px 12px",
  color: "#0f172a",
  fontSize: 14,
  lineHeight: 1.2,
  boxSizing: "border-box",
};
export const primaryButton: CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#0b5fff",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: 0.1,
};
export const secondaryButton: CSSProperties = {
  border: "1px solid #d3deea",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#ffffff",
  color: "#0f172a",
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: 0.1,
};
export const disabledButton: CSSProperties = {
  opacity: 0.5,
  cursor: "not-allowed",
};
export const iconButton: CSSProperties = {
  width: 34,
  height: 34,
  border: "1px solid #d3deea",
  borderRadius: 8,
  background: "#ffffff",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};
