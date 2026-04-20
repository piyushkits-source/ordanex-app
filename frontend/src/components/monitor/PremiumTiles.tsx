import { FaBoxOpen, FaCircleCheck, FaClockRotateLeft, FaTriangleExclamation } from "react-icons/fa6";
import { card } from "../common/styles";
const iconMap = { total: <FaBoxOpen />, success: <FaCircleCheck />, pending: <FaClockRotateLeft />, error: <FaTriangleExclamation /> };
export default function PremiumTiles() {
  const cards = [{ key: "total", label: "Total Messages", value: "148" }, { key: "success", label: "Successful", value: "112" }, { key: "pending", label: "Pending", value: "24" }, { key: "error", label: "Errors", value: "12" }] as const;
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
    {cards.map(cardItem => <div key={cardItem.key} style={{ ...card, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "#64748b", fontSize: 13, fontWeight: 700 }}>{cardItem.label}</div>
        <div style={{ width: 42, height: 42, borderRadius: 14, background: "#eff6ff", color: "#1d4ed8", display: "grid", placeItems: "center" }}>{iconMap[cardItem.key]}</div>
      </div>
      <div style={{ fontSize: 32, fontWeight: 900, color: "#0f172a", marginTop: 10 }}>{cardItem.value}</div>
    </div>)}
  </div>;
}