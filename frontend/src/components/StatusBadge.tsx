interface Props {
  value: string | null | undefined;
}

const colorMap: Record<string, string> = {
  NEW: "#2563eb",
  PENDING: "#d97706",
  ERROR: "#dc2626",
  APPROVED: "#059669",
  TRANSFORMED: "#7c3aed",
  DISPATCHED: "#0891b2",
  ARCHIVED: "#4b5563",
  ACTIVE: "#059669",
};

export default function StatusBadge({ value }: Props) {
  const label = value || "-";
  const background = colorMap[label] || "#6b7280";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        color: "#fff",
        background,
      }}
    >
      {label}
    </span>
  );
}