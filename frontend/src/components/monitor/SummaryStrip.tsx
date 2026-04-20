const tiles = [
  ["Total Messages", "148"],
  ["Successful", "112"],
  ["Pending", "24"],
  ["Errors", "12"],
];

export default function SummaryStrip() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, background: "#ffffff" }}>
      {tiles.map(([label, value], index) => (
        <div
          key={label}
          style={{
            padding: "18px 20px",
            borderLeft: index === 0 ? "none" : "1px solid #dbe4ee",
          }}
        >
          <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>{label}</div>
          <div style={{ marginTop: 8, fontSize: 34, color: "#0f172a", fontWeight: 900 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}