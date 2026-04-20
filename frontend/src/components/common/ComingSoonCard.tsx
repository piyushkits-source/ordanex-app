export default function ComingSoonCard({ title, points }: { title: string; points: string[] }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 18 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <ul style={{ margin: 0, paddingLeft: 18, color: "#4b5563", lineHeight: 1.7 }}>
        {points.map((p) => <li key={p}>{p}</li>)}
      </ul>
    </div>
  );
}