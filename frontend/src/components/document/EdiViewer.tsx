interface Props {
  content?: string;
}

interface EdiSegment {
  index: number;
  tag: string;
  raw: string;
  elements: string[];
}

export default function EdiViewer({ content }: Props) {
  const parsed = parseEdi(content || "");

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {parsed.map((segment) => (
        <div key={segment.index} style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <strong>{segment.tag}</strong>
            <span style={{ color: "#6b7280", fontSize: 12 }}>Segment {segment.index + 1}</span>
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 13, marginBottom: 8 }}>{segment.raw}</div>
          <div style={{ display: "grid", gap: 4 }}>
            {segment.elements.map((element, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 8 }}>
                <div style={{ color: "#6b7280", fontSize: 12 }}>Element {idx + 1}</div>
                <div style={{ fontFamily: "monospace", fontSize: 13 }}>{element}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {!parsed.length ? <div style={{ padding: 16 }}>No EDI content detected.</div> : null}
    </div>
  );
}

function parseEdi(content: string): EdiSegment[] {
  const text = content.trim();
  if (!text) return [];

  const isX12 = text.includes("ISA*") || text.includes("GS*") || text.includes("ST*");
  const segmentSeparator = isX12 ? "~" : "'";
  const elementSeparator = isX12 ? "*" : "+";

  return text
    .split(segmentSeparator)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment, index) => {
      const elements = segment.split(elementSeparator).map((part) => part.trim());
      return {
        index,
        tag: elements[0] || "SEG",
        raw: segment,
        elements,
      };
    });
}