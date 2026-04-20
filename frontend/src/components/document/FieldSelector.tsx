interface Props {
  fields: string[];
  selectedField?: string | null;
  onSelectField: (field: string) => void;
}

export default function FieldSelector({ fields, selectedField, onSelectField }: Props) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {fields.map((field) => (
        <button
          key={field}
          type="button"
          onClick={() => onSelectField(field)}
          style={{
            textAlign: "left",
            padding: "10px 12px",
            borderRadius: 10,
            border: `1px solid ${selectedField === field ? "#111827" : "#d1d5db"}`,
            background: selectedField === field ? "#111827" : "#fff",
            color: selectedField === field ? "#fff" : "#111827",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {field}
        </button>
      ))}
    </div>
  );
}