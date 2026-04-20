import PageHeader from "../components/common/PageHeader";

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 18 };

export default function DashboardPage() {
  const items = [
    ["POs Today", "128"],
    ["Pending Review", "12"],
    ["Errors", "5"],
    ["Dispatched", "94"],
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Operational overview of order automation." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 14 }}>
        {items.map(([label, value]) => (
          <div key={label} style={card}>
            <div style={{ color: "#6b7280", fontSize: 13 }}>{label}</div>
            <div style={{ fontSize: 32, fontWeight: 800, marginTop: 6 }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}