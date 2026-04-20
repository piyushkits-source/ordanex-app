import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import BoundingBoxOverlay from "./BoundingBoxOverlay";
import type { ViewerBaseProps } from "./types";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const pdfOptions = {
  cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
};

interface Props extends ViewerBaseProps {
  editable?: boolean;
}

export default function PdfViewer({
  fileUrl,
  boxes,
  selectedField,
  onSelectField,
  onBoxesChange,
  editable = false,
}: Props) {
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);

  if (!fileUrl) {
    return <EmptyMessage message="No PDF file URL provided." />;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={() => setScale((s) => Math.max(0.6, s - 0.1))}>-</button>
        <span style={{ fontSize: 13, color: "#4b5563" }}>Zoom {Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => setScale((s) => Math.min(2.5, s + 0.1))}>+</button>
      </div>

      <Document file={fileUrl} options={pdfOptions} onLoadSuccess={(result) => setNumPages(result.numPages)}>
        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNo) => (
          <div key={pageNo} style={{ position: "relative", width: "fit-content", marginBottom: 16 }}>
            <Page pageNumber={pageNo} scale={scale} renderTextLayer={false} renderAnnotationLayer={false} />
            <BoundingBoxOverlay
              page={pageNo}
              scale={scale}
              boxes={boxes}
              selectedField={selectedField}
              onSelectField={onSelectField}
              onBoxesChange={onBoxesChange}
              editable={editable}
            />
          </div>
        ))}
      </Document>
    </div>
  );
}

function EmptyMessage({ message }: { message: string }) {
  return <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>{message}</div>;
}
