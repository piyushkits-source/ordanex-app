import { useMemo, useState } from "react";
import { formatXml } from "./utils";

interface Props {
  content?: string;
  selectedField?: string | null;
  onValueSelect?: (value: string) => void;
}

interface EdiSegment {
  index: number;
  tag: string;
  raw: string;
  elements: string[];
}

export default function EdiViewer({ content, selectedField, onValueSelect }: Props) {
  const parsed = useMemo(() => parseEdi(content || ""), [content]);
  const [picked, setPicked] = useState<{ segment: number; element: number } | null>(null);
  const isXmlLike = /<\/?(IDOC|EDI_DC40|INVOIC|ORDERS|DESADV|\w+:[A-Za-z0-9_]+)/i.test(content || "");
  const formattedXml = isXmlLike ? formatXml(content || "") : "";
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  if (!parsed.length && !isXmlLike) {
    return <div style={{ padding: 16 }}>No EDI content detected.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {isXmlLike ? (
        <div style={{ border: "1px solid #dbe4ee", borderRadius: 12, background: "#fff", padding: 14, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>Structured IDoc Preview</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Pretty-printed XML/IDoc payload for faster review.</div>
            </div>
            <SummaryChip label="Format" value="IDOC/XML" />
          </div>
          <pre style={{
            whiteSpace: "pre",
            overflow: "auto",
            margin: 0,
            border: "1px solid #eef2f7",
            borderRadius: 10,
            padding: 14,
            background: "#fbfdff",
            fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
            fontSize: 12,
            lineHeight: 1.55,
            color: "#0f172a",
          }}>{formattedXml}</pre>
        </div>
      ) : null}
      <div
        style={{
          border: "1px solid #dbe4ee",
          borderRadius: 12,
          background: "#f8fafc",
          padding: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>
            Structured EDI Viewer
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Read segments as business blocks and click a value to map it to the selected field.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <SummaryChip label="Segments" value={String(parsed.length)} />
          <SummaryChip label="Format" value={detectFlavor(parsed)} />
          {selectedField ? <SummaryChip label="Selected Field" value={selectedField} accent /> : null}
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {parsed.map((segment) => {
          const label = segmentLabel(segment.tag);
          const summary = summarizeSegment(segment);
          const isOpen = expanded[segment.index] ?? segment.index < 6;

          return (
            <div
              key={segment.index}
              style={{
                border: "1px solid #dbe4ee",
                borderRadius: 12,
                background: "#fff",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setExpanded((prev) => ({
                    ...prev,
                    [segment.index]: !isOpen,
                  }))
                }
                style={{
                  width: "100%",
                  border: "none",
                  background: "#fff",
                  padding: "12px 14px",
                  display: "grid",
                  gridTemplateColumns: "120px 1fr auto",
                  gap: 12,
                  alignItems: "start",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Segment</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{segment.tag}</div>
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{label}</div>
                  <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{summary}</div>
                </div>
                <div style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap", paddingTop: 2 }}>
                  {isOpen ? "Hide" : "Show"}
                </div>
              </button>

              {isOpen ? (
                <div
                  style={{
                    borderTop: "1px solid #eef2f7",
                    padding: 12,
                    display: "grid",
                    gap: 10,
                    background: "#fbfdff",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: 12,
                      whiteSpace: "nowrap",
                      overflowX: "auto",
                      color: "#475569",
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: "8px 10px",
                    }}
                  >
                    {segment.raw}
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <div style={{ display: "flex", gap: 8, minWidth: "max-content" }}>
                      {segment.elements.map((element, idx) => {
                        const text = String(element || "").trim();
                        const canSelect = !!selectedField && !!text;
                        const isPicked = picked?.segment === segment.index && picked?.element === idx;
                        const isSuggested = canSelect && looksLikeMatch(selectedField, text, segment.tag, idx);
                        const normalizedValue = normalizeClickedValue(selectedField, text, segment.tag, idx);

                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              if (!canSelect) return;
                              setPicked({ segment: segment.index, element: idx });
                              onValueSelect?.(normalizedValue);
                            }}
                            title={canSelect ? `Map this value to ${selectedField}` : undefined}
                            style={{
                              minWidth: 210,
                              maxWidth: 340,
                              borderRadius: 10,
                              border: isPicked
                                ? "2px solid #0b5fff"
                                : isSuggested
                                ? "1px solid rgba(22,163,74,0.7)"
                                : "1px solid #dbe4ee",
                              background: isPicked
                                ? "rgba(11,95,255,0.14)"
                                : isSuggested
                                ? "rgba(22,163,74,0.10)"
                                : "#fff",
                              cursor: canSelect ? "pointer" : "default",
                              padding: "10px 12px",
                              display: "grid",
                              gap: 6,
                              textAlign: "left",
                              flex: "0 0 auto",
                            }}
                          >
                            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>
                              Element {idx + 1}
                            </div>
                            <div
                              style={{
                                fontFamily: "monospace",
                                fontSize: 13,
                                color: "#0f172a",
                                whiteSpace: "nowrap",
                                overflowX: "auto",
                              }}
                            >
                              {text || "-"}
                            </div>
                            {normalizedValue !== text ? (
                              <div style={{ fontSize: 11, color: "#0b5fff", fontWeight: 700 }}>
                                Maps as: {normalizedValue}
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryChip({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        border: `1px solid ${accent ? "#bfdbfe" : "#dbe4ee"}`,
        background: accent ? "#eff6ff" : "#fff",
        borderRadius: 999,
        padding: "6px 10px",
        display: "flex",
        gap: 6,
        alignItems: "center",
      }}
    >
      <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 12, color: accent ? "#0b5fff" : "#0f172a", fontWeight: 800 }}>{value}</span>
    </div>
  );
}

function detectFlavor(segments: EdiSegment[]): string {
  const tags = new Set(segments.slice(0, 5).map((segment) => segment.tag.toUpperCase()));
  if (tags.has("ISA") || tags.has("GS") || tags.has("ST")) return "X12";
  if (tags.has("UNB") || tags.has("UNH")) return "EDIFACT";
  return "EDI";
}

function segmentLabel(tag: string): string {
  const key = String(tag || "").toUpperCase();
  const map: Record<string, string> = {
    ISA: "Interchange Header",
    GS: "Functional Group Header",
    ST: "Transaction Header",
    BEG: "Purchase Order Header",
    CUR: "Currency",
    REF: "Reference",
    PER: "Contact",
    FOB: "Freight / Shipping Terms",
    DTM: "Date / Time",
    N1: "Party Identification",
    N3: "Address Line",
    N4: "City / State / Postal",
    PO1: "Line Item",
    PID: "Description",
    CTT: "Transaction Totals",
    SE: "Transaction Trailer",
    GE: "Functional Group Trailer",
    IEA: "Interchange Trailer",
    UNB: "Interchange Header",
    UNH: "Message Header",
    BGM: "Beginning of Message",
    NAD: "Party",
    QTY: "Quantity",
    PRI: "Price",
    IMD: "Item Description",
    LIN: "Line Item",
    UNS: "Section Control",
    UNT: "Message Trailer",
    UNZ: "Interchange Trailer",
  };
  return map[key] || "EDI Segment";
}

function summarizeSegment(segment: EdiSegment): string {
  const tag = segment.tag.toUpperCase();
  const values = segment.elements.slice(1).filter(Boolean);

  if (tag === "BEG") {
    return `PO header with document number ${values[2] || values[1] || "-"} and date ${values[4] || "-"}.`;
  }
  if (tag === "DTM") {
    return `Date/time segment carrying qualifier and value ${values.join(" | ") || "-"}.`;
  }
  if (tag === "N1" || tag === "NAD") {
    return `Party segment for buyer, supplier, or ship-to. Values: ${values.slice(0, 3).join(" | ") || "-"}.`;
  }
  if (tag === "PO1" || tag === "LIN") {
    return `Line item segment. Values: ${values.slice(0, 4).join(" | ") || "-"}.`;
  }
  if (tag === "PID" || tag === "IMD") {
    return `Description segment: ${values.slice(0, 3).join(" | ") || "-"}.`;
  }
  return values.slice(0, 4).join(" | ") || "No additional elements.";
}

function parseEdi(content: string): EdiSegment[] {
  const text = content.trim();
  if (!text) return [];

  const isX12 = text.includes("ISA*") || text.includes("ISA~") || text.includes("GS*") || text.includes("GS~") || text.includes("ST*") || text.includes("ST~");
  let elementSeparator = isX12 ? "*" : "+";

  if (isX12 && text.startsWith("ISA") && text.length > 3) {
    const detected = text.charAt(3);
    if (detected && !/[A-Za-z0-9\s]/.test(detected)) {
      elementSeparator = detected;
    }
  }

  const segmentCandidates = text.includes("\n")
    ? text.split(/\r?\n/).map((segment) => segment.trim()).filter(Boolean)
    : text.split(isX12 ? "~" : "'").map((segment) => segment.trim()).filter(Boolean);

  return segmentCandidates.map((segment, index) => {
    const elements = segment.split(elementSeparator).map((part) => part.trim());
    return {
      index,
      tag: elements[0] || "SEG",
      raw: segment,
      elements,
    };
  });
}

function normalizeClickedValue(selectedField?: string | null, value?: string | null, tag?: string, elementIndex?: number): string {
  const key = String(selectedField || "");
  const text = String(value || "").trim();
  const seg = String(tag || "").toUpperCase();
  const compositeParts = text.split(":").map((part) => part.trim()).filter(Boolean);
  if (!key || !text) return text;

  if (
    key === "customer_name" ||
    key === "supplier_name" ||
    key === "ship_to_name" ||
    key === "ship_to_code" ||
    key === "sold_to" ||
    key === "receiver" ||
    key === "sender"
  ) {
    const preferred = compositeParts.find((part) => /^[A-Z0-9][A-Z0-9._/-]{4,}$/i.test(part));
    return preferred || text;
  }

  if (key === "document_date" || key === "po_date" || key.endsWith("delivery_date")) {
    if (seg === "DTM" || seg === "DATE") {
      const dateLike = compositeParts.find((part) => /^\d{8,14}$/.test(part));
      if (dateLike) return dateLike.slice(0, 8);
    }
    const eightDigits = text.match(/\b(\d{8})\d{0,6}\b/);
    if (eightDigits) return eightDigits[1];
    return text;
  }

  if (key.endsWith("material_code") || key.endsWith("mapped_product")) {
    const codeLike = compositeParts.find((part) => /[A-Z0-9][A-Z0-9/_-]{3,}/i.test(part));
    return codeLike || text;
  }

  if (key.endsWith("quantity") || key.endsWith("amount") || key.endsWith("unit_price")) {
    const numeric = compositeParts.find((part) => /^\d+[\d,.-]*$/.test(part));
    return numeric || text;
  }

  if (key.endsWith("customer_uom") || key.endsWith("uom")) {
    const uom = compositeParts.find((part) => /^(EA|PCS|PC|PIECE|PIECES|KG|G|LB|LBS|L|ML|M|MM|CM|BOX|PACK|SET)$/i.test(part));
    return uom || text;
  }

  return text;
}

function looksLikeMatch(selectedField?: string | null, value?: string | null, tag?: string, elementIndex?: number): boolean {
  const key = String(selectedField || "");
  const text = String(value || "").trim();
  const seg = String(tag || "").toUpperCase();
  if (!key || !text) return false;

  if (key === "document_number" || key === "po_number") {
    return (seg === "BEG" && (elementIndex === 2 || elementIndex === 3)) || /[A-Z0-9][A-Z0-9/_-]{4,}/i.test(text);
  }
  if (
    key === "customer_name" ||
    key === "supplier_name" ||
    key === "ship_to_name" ||
    key === "ship_to_code" ||
    key === "sold_to" ||
    key === "receiver" ||
    key === "sender"
  ) {
    return seg === "NAD" || seg === "N1" || /^[A-Z0-9][A-Z0-9._:/-]{4,}$/i.test(text);
  }
  if (key === "document_date" || key === "po_date" || key.endsWith("delivery_date")) {
    return seg === "DTM" || /\b\d{8}\b/.test(text) || /\b\d{6,14}\b/.test(text);
  }
  if (key.endsWith("material_code") || key.endsWith("mapped_product")) {
    return /[A-Z0-9][A-Z0-9/_-]{3,}/i.test(text);
  }
  if (key.endsWith("customer_uom") || key.endsWith("uom")) {
    return /^(EA|PCS|PC|PIECE|PIECES|KG|G|LB|LBS|L|ML|M|MM|CM|BOX|PACK|SET)$/i.test(text) || /^[A-Z]{2,4}:/.test(text);
  }
  if (key.endsWith("quantity") || key.endsWith("amount") || key.endsWith("unit_price")) {
    return /^\d+[\d,.-]*$/.test(text) || /^\d+:.+/.test(text);
  }
  if (key.endsWith("description") || key.endsWith("line_details")) {
    return text.length >= 6;
  }
  return false;
}
