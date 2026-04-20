import { useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { BoundingBox, MappingField } from "../../types/monitoring";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Props {
  fileUrl: string;
  mappings: MappingField[];
  selectedField?: string | null;
  onSelectField?: (fieldKey: string) => void;
  editable?: boolean;
  onBoxDrawn?: (fieldKey: string, bbox: BoundingBox) => void;
}

export default function PdfBoundingBoxViewer({
  fileUrl,
  mappings,
  selectedField,
  onSelectField,
  editable = false,
  onBoxDrawn,
}: Props) {
  const [numPages, setNumPages] = useState(0);
  const [pageWidth, setPageWidth] = useState(820);
  const [draft, setDraft] = useState<{
    page: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);

  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const pageMappings = useMemo(() => {
    const grouped: Record<number, MappingField[]> = {};
    for (const m of mappings) {
      const page = m.bbox?.page || 1;
      if (!grouped[page]) grouped[page] = [];
      grouped[page].push(m);
    }
    return grouped;
  }, [mappings]);

  const beginDraw = (event: React.MouseEvent<HTMLDivElement>, page: number) => {
    if (!editable || !selectedField) return;
    const rect = pageRefs.current[page]?.getBoundingClientRect();
    if (!rect) return;
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setDraft({ page, startX: x, startY: y, endX: x, endY: y });
  };

  const moveDraw = (event: React.MouseEvent<HTMLDivElement>, page: number) => {
    if (!editable || !draft || draft.page !== page) return;
    const rect = pageRefs.current[page]?.getBoundingClientRect();
    if (!rect) return;
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setDraft((prev) => prev ? { ...prev, endX: x, endY: y } : prev);
  };

  const endDraw = () => {
    if (!editable || !draft || !selectedField || !onBoxDrawn) {
      setDraft(null);
      return;
    }

    const x = Math.min(draft.startX, draft.endX);
    const y = Math.min(draft.startY, draft.endY);
    const width = Math.abs(draft.endX - draft.startX);
    const height = Math.abs(draft.endY - draft.startY);

    if (width > 0.4 && height > 0.4) {
      onBoxDrawn(selectedField, { x, y, width, height, page: draft.page });
    }
    setDraft(null);
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ color: "#0f172a" }}>Original PO Viewer</strong>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setPageWidth((w) => Math.max(520, w - 80))}>-</button>
          <button type="button" onClick={() => setPageWidth((w) => Math.min(1200, w + 80))}>+</button>
        </div>
      </div>

      <Document file={fileUrl} onLoadSuccess={(doc) => setNumPages(doc.numPages)}>
        {Array.from({ length: numPages }, (_, i) => i + 1).map((page) => (
          <div
            key={page}
            ref={(el) => { pageRefs.current[page] = el; }}
            onMouseDown={(e) => beginDraw(e, page)}
            onMouseMove={(e) => moveDraw(e, page)}
            onMouseUp={endDraw}
            style={{ position: "relative", width: pageWidth, maxWidth: "100%" }}
          >
            <Page pageNumber={page} width={pageWidth} renderTextLayer={false} renderAnnotationLayer={false} />
            <div style={{ position: "absolute", inset: 0 }}>
              {(pageMappings[page] || []).map((field) => {
                const box = field.bbox;
                if (!box) return null;
                const active = selectedField === field.key;
                return (
                  <button
                    key={field.key}
                    type="button"
                    title={field.label}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectField?.(field.key);
                    }}
                    style={{
                      position: "absolute",
                      left: `${box.x}%`,
                      top: `${box.y}%`,
                      width: `${box.width}%`,
                      height: `${box.height}%`,
                      border: `2px solid ${active ? "#ef4444" : "#2563eb"}`,
                      background: active ? "rgba(239,68,68,0.12)" : "rgba(37,99,235,0.10)",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  />
                );
              })}

              {draft && draft.page === page ? (
                <div
                  style={{
                    position: "absolute",
                    left: `${Math.min(draft.startX, draft.endX)}%`,
                    top: `${Math.min(draft.startY, draft.endY)}%`,
                    width: `${Math.abs(draft.endX - draft.startX)}%`,
                    height: `${Math.abs(draft.endY - draft.startY)}%`,
                    border: "2px dashed #10b981",
                    background: "rgba(16,185,129,0.12)",
                    borderRadius: 4,
                  }}
                />
              ) : null}
            </div>
          </div>
        ))}
      </Document>
    </div>
  );
}
