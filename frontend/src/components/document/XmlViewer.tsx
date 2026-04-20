import { formatXml } from "./utils";

interface Props {
  content?: string;
}

export default function XmlViewer({ content }: Props) {
  return (
    <pre
      style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        background: "#111827",
        color: "#f9fafb",
        padding: 16,
        borderRadius: 12,
        overflow: "auto",
        maxHeight: 700,
      }}
    >
      {formatXml(content)}
    </pre>
  );
}