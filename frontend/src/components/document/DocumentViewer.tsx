interface Props {
  fileUrl?: string;
  rawText?: string;
  mimeType?: string;
  fileName?: string;
}
export default function DocumentViewer({ fileUrl, rawText, mimeType, fileName }: Props) {
  const mime = (mimeType || "").toLowerCase();
  const name = (fileName || "").toLowerCase();
  if ((mime.includes("pdf") || name.endsWith(".pdf")) && fileUrl) {
    return (
      <iframe
        src={fileUrl}
        title="PDF Viewer"
        style={{
          width: "100%",
          minHeight: 620,
          border: "1px solid #dbe4ee",
          borderRadius: 12,
          background: "#fff",
        }}
      />
    );
  }
  return (
    <pre
      style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        background: "#fff",
        border: "1px solid #dbe4ee",
        borderRadius: 12,
        padding: 14,
        maxHeight: 620,
        overflow: "auto",
        margin: 0,
      }}
    >
      {rawText || "No preview content available."}
    </pre>
  );
}