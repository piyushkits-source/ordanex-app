import { useEffect } from "react";
import { FaCheckCircle, FaTimesCircle } from "react-icons/fa";

export default function Toast({
  message,
  type = "success",
  onClose,
}: {
  message: string;
  type?: "success" | "error";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, []);

  const isSuccess = type === "success";

  return (
    <div
      style={{
        position: "fixed",
        top: 24,
        right: 24,
        zIndex: 9999,
        background: "#fff",
        borderRadius: 14,
        padding: "14px 16px",
        boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
        borderLeft: `6px solid ${isSuccess ? "#16a34a" : "#dc2626"}`,
        display: "flex",
        alignItems: "center",
        gap: 12,
        minWidth: 280,
        animation: "slideIn 0.25s ease",
      }}
    >
      <div style={{ fontSize: 20 }}>
        {isSuccess ? (
          <FaCheckCircle color="#16a34a" />
        ) : (
          <FaTimesCircle color="#dc2626" />
        )}
      </div>

      <div style={{ fontWeight: 600, color: "#0f172a" }}>{message}</div>
    </div>
  );
}