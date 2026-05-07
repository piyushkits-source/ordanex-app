import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

interface Props {
  fileUrl?: string;
  rawText?: string;
  selectedField?: string | null;
  onValueSelect?: (value: string) => void;
}

export default function SpreadsheetViewer({ fileUrl, rawText, selectedField, onValueSelect }: Props) {
  const [rows, setRows] = useState<string[][]>([]);
  const [pickedCell, setPickedCell] = useState<{ row: number; col: number } | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const useRawText = !!rawText && !looksBinarySpreadsheetText(rawText);

      if (useRawText) {
        const parsed = parseDelimitedText(rawText || "");
        if (active) setRows(parsed);
        return;
      }

      if (!fileUrl) return;
      const response = await fetch(fileUrl);
      const buffer = await response.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<(string | number | null)[]>(firstSheet, { header: 1 });
      if (active) {
        setRows(json.map((row) => row.map((cell) => String(cell ?? ""))));
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [fileUrl, rawText]);

  if (!rows.length) {
    return <div style={{ padding: 16 }}>No spreadsheet content available.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {selectedField ? (
        <div
          style={{
            border: "1px solid #dbe4ee",
            borderRadius: 10,
            background: "#f8fafc",
            padding: "8px 12px",
            color: "#475569",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Click a spreadsheet cell to map it to <span style={{ color: "#0b5fff" }}>{selectedField}</span>. Suggested cells are lightly highlighted.
        </div>
      ) : null}

      <div style={{ overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => {
                  const text = String(cell || "").trim();
                  const canSelect = !!selectedField && !!text;
                  const isPicked = pickedCell?.row === rowIndex && pickedCell?.col === cellIndex;
                  const isSuggested = canSelect && looksLikeMatch(selectedField, text);
                  return (
                    <td
                      key={`${rowIndex}-${cellIndex}`}
                      onClick={() => {
                        if (!canSelect) return;
                        setPickedCell({ row: rowIndex, col: cellIndex });
                        onValueSelect?.(text);
                      }}
                      title={canSelect ? `Map this cell to ${selectedField}` : undefined}
                      style={{
                        border: "1px solid #e5e7eb",
                        padding: 8,
                        fontSize: 13,
                        verticalAlign: "top",
                        cursor: canSelect ? "pointer" : "default",
                        background: isPicked
                          ? "rgba(11,95,255,0.14)"
                          : isSuggested
                          ? "rgba(22,163,74,0.10)"
                          : "#fff",
                        boxShadow: isPicked ? "inset 0 0 0 2px #0b5fff" : isSuggested ? "inset 0 0 0 1px rgba(22,163,74,0.5)" : "none",
                        transition: "all 120ms ease",
                      }}
                    >
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function looksBinarySpreadsheetText(value: string): boolean {
  const text = String(value || "");
  if (!text) return false;

  const weirdCharCount = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g) || []).length;
  const sampleLength = Math.max(1, Math.min(text.length, 4000));
  const weirdRatio = weirdCharCount / sampleLength;

  return weirdRatio > 0.02;
}

function parseDelimitedText(text: string): string[][] {
  const lines = String(text || "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (!lines.length) return [];

  const firstLine = lines[0] || "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  const delimiter = tabCount >= commaCount && tabCount >= semicolonCount ? "\t" : semicolonCount > commaCount ? ";" : ",";

  return lines.map((line) => line.split(delimiter));
}

function looksLikeMatch(selectedField?: string | null, value?: string | null): boolean {
  const key = String(selectedField || "");
  const text = String(value || "").trim();
  if (!key || !text) return false;

  if (key.endsWith("material_code") || key.endsWith("mapped_product") || key === "document_number" || key === "po_number") {
    return /[A-Z0-9][A-Z0-9/_-]{3,}/i.test(text);
  }

  if (key.endsWith("delivery_date") || key === "document_date" || key === "po_date") {
    return /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4})\b/.test(text);
  }

  if (key.endsWith("customer_uom") || key.endsWith("uom")) {
    return /^(EA|PCS|PC|PIECE|PIECES|KG|G|LB|LBS|L|ML|M|MM|CM|BOX|PACK|SET)$/i.test(text);
  }

  if (key.endsWith("quantity") || key.endsWith("amount") || key.endsWith("unit_price")) {
    return /^\d+[\d,.-]*$/.test(text);
  }

  if (key.endsWith("description") || key.endsWith("line_details") || key === "header_details") {
    return text.length >= 6;
  }

  return false;
}
