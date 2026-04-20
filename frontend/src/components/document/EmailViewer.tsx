interface Props {
  content?: string;
}

export default function EmailViewer({ content }: Props) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        minHeight: 200,
      }}
      dangerouslySetInnerHTML={{ __html: content || "<div>No email body available.</div>" }}
    />
  );
}