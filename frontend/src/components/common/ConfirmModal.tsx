import { FaExclamationTriangle } from "react-icons/fa";

export default function ConfirmModal({
  title,
  message,
  confirmText,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: 460,
          background: "#fff",
          borderRadius: 18,
          padding: 22,
          boxShadow: "0 30px 80px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <FaExclamationTriangle size={22} color="#f59e0b" />
          <div style={{ fontWeight: 800, fontSize: 18 }}>{title}</div>
        </div>

        <div style={{ marginTop: 12, color: "#475569", fontSize: 14 }}>
          {message}
        </div>

        <div
          style={{
            marginTop: 20,
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button
            onClick={onCancel}
            style={{
              border: "1px solid #dbe4ee",
              background: "#fff",
              padding: "10px 14px",
              borderRadius: 10,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>

          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              background: "#0b5fff",
              color: "#fff",
              padding: "10px 16px",
              borderRadius: 10,
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
            }}
          >
            {loading ? "Processing..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}