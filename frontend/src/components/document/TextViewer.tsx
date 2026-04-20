interface Props {
  content?: string;
}

export default function TextViewer({ content }: Props) {
  return (
    <pre
      style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        maxHeight: 700,
        overflow: "auto",
      }}
    >
      {content || "No content available."}
    </pre>
  );
}