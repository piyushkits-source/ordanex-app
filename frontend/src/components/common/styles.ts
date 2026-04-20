import type { CSSProperties } from "react";

export const appShell: CSSProperties = {
  maxWidth: 1920,
  margin: "0 auto",
  background: "#f6f9fc",
};

export const pageWrap: CSSProperties = {
  padding: 18,
  display: "grid",
  gap: 0,
  background: "#ffffff",
  border: "1px solid #d9e1ea",
  borderRadius: 18,
  boxShadow: "0 10px 28px rgba(15,23,42,0.05)",
  overflow: "hidden",
};

export const divider: CSSProperties = {
  borderTop: "1px solid #dbe4ee",
};

export const softInput: CSSProperties = {
  width: "100%",
  border: "1px solid rgba(255,255,255,0.45)",
  borderRadius: 12,
  padding: "11px 14px",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: 14,
  boxSizing: "border-box",
};

export const selectInput: CSSProperties = {
  width: "100%",
  border: "1px solid #bfd0e2",
  borderRadius: 10,
  padding: "11px 12px",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: 14,
  boxSizing: "border-box",
};

export const actionBtnPrimary: CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#1d4ed8",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

export const actionBtnSecondary: CSSProperties = {
  border: "1px solid #d3deea",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#fff",
  color: "#0f172a",
  fontWeight: 700,
  cursor: "pointer",
};

export const smallIconBtn: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: "1px solid #d3deea",
  background: "#fff",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};