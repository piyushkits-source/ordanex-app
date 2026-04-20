import UserMenu from "../common/UserMenu";

export default function TopSection() {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #2094d8 0%, #0b6fb8 100%)",
        padding: "20px 22px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div style={{ fontSize: 36, fontWeight: 900, color: "#ffffff", letterSpacing: 0.2 }}>
        Ordanex
      </div>
      <UserMenu />
    </div>
  );
}