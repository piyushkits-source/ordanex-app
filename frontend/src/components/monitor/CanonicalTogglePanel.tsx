
import React, { useState } from "react";
import { CanonicalDocument } from "types/canonical";

type Props = {
  canonical?: CanonicalDocument | null;
  onDownloadCanonical: () => void | Promise<void>;
  children: React.ReactNode;
};

export default function CanonicalTogglePanel({
  canonical,
  onDownloadCanonical,
  children,
}: Props) {
  const [showCanonical, setShowCanonical] = useState(false);

  return (
    <div style={wrap}>
      <div style={toolbar}>
        <button
          type="button"
          style={secondaryButton}
          onClick={() => setShowCanonical((v) => !v)}
        >
          {showCanonical ? "Hide Canonical" : "View Canonical"}
        </button>

        <button
          type="button"
          style={primaryButton}
          onClick={() => void onDownloadCanonical()}
        >
          Download Canonical
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        {showCanonical ? (
          <pre style={canonicalBlock}>
            {JSON.stringify(canonical || { message: "Canonical payload not available." }, null, 2)}
          </pre>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = { minWidth: 0 };

const toolbar: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const primaryButton: React.CSSProperties = {
  border: "1px solid #0b5fff",
  background: "#0b5fff",
  color: "#fff",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const canonicalBlock: React.CSSProperties = {
  background: "#0f172a",
  color: "#e2e8f0",
  padding: 12,
  borderRadius: 8,
  overflowX: "auto",
  fontSize: 12,
  lineHeight: 1.5,
  maxHeight: 420,
};
