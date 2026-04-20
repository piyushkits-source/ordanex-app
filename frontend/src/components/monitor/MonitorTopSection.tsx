import UserMenu from "../common/UserMenu";

export default function MonitorTopSection() {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #1787cf 0%, #0964a8 100%)",
        padding: "20px 22px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div style={{ fontSize: 36, fontWeight: 900, color: "#ffffff", letterSpacing: 0.1 }}>Ordanex</div>
      <UserMenu />
    </div>
  );
}
