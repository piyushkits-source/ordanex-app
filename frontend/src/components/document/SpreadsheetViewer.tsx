import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

interface Props {
  fileUrl?: string;
  rawText?: string;
}

export default function SpreadsheetViewer({ fileUrl, rawText }: Props) {
  const [rows, setRows] = useState<string[][]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (rawText) {
        const parsed = rawText
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => line.split(","));
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
    <div style={{ overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={`${rowIndex}-${cellIndex}`}
                  style={{ border: "1px solid #e5e7eb", padding: 8, fontSize: 13, verticalAlign: "top" }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}