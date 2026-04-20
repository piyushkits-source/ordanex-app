const summaryItems = [
  ["Total Messages", "148"],
  ["Processed", "112"],
  ["Pending", "24"],
  ["Failed", "12"],
];

export default function MonitorSummaryStrip() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", background: "#ffffff" }}>
      {summaryItems.map(([label, value], index) => (
        <div key={label} style={{ padding: "18px 20px", borderLeft: index === 0 ? "none" : "1px solid #dbe4ee" }}>
          <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700, letterSpacing: 0.1 }}>{label}</div>
          <div style={{ marginTop: 8, fontSize: 34, color: "#0f172a", fontWeight: 900 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}
