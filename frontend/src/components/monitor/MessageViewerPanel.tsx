import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { FaDownload } from "react-icons/fa";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type BBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  page?: number;
};

type MappingItem = {
  key?: string;
  label?: string;
  value?: string;
  bbox?: BBox | null;
};

type Props = {
  fileUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  rawText?: string | null;
  mappings?: MappingItem[];
  selectedField?: string | null;
  onSelectField?: (fieldKey: string) => void;
  onBBoxChange?: (fieldKey: string, bbox: BBox, value?: string) => void;
  editable?: boolean;
};

export default function MessageViewerPanel({
  fileUrl,
  fileName,
  mimeType,
  rawText,
  mappings = [],
  selectedField,
  onSelectField,
  onBBoxChange,
  editable = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageWrapRef = useRef<HTMLDivElement | null>(null);
  const pageLayerRef = useRef<HTMLDivElement | null>(null);

  const [pdfBlobUrl, setPdfBlobUrl] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageWidth, setPageWidth] = useState(900);
  const [pdfError, setPdfError] = useState("");

  const [draftBoxes, setDraftBoxes] = useState<Record<string, BBox>>({});
  const [drawing, setDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(
    null
  );
  const [dragBox, setDragBox] = useState<BBox | null>(null);
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const [overlayVersion, setOverlayVersion] = useState(0);

  const isPdf =
    !!fileUrl &&
    (((mimeType || "").toLowerCase().includes("pdf")) ||
      fileUrl.toLowerCase().includes("/download"));

  const canEditBbox = editable;

  const pdfOptions = useMemo(
    () => ({
      cMapUrl: "https://unpkg.com/pdfjs-dist@5.4.296/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "https://unpkg.com/pdfjs-dist@5.4.296/standard_fonts/",
    }),
    []
  );

  useEffect(() => {
    let active = true;
    let objectUrl = "";

	    async function loadPdf() {
      if (!isPdf || !fileUrl) {
        setPdfBlobUrl("");
        setPdfError("");
        return;
      }
      try {
        setPdfError("");
        const response = await fetch(fileUrl, { method: "GET" });
        if (!response.ok) {
          if (active) {
            setPdfBlobUrl("");
            if (response.status === 410) {
              setPdfError("Original document unavailable — migrated record. PO metadata is still accessible.");
            } else if (response.status === 404) {
              setPdfError("Document not found.");
            } else {
              setPdfError(`Unable to fetch PDF (${response.status})`);
            }
          }
          return;
        }
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const errData = await response.json();
          if (active) {
            setPdfBlobUrl("");
            setPdfError(errData.message || "Document unavailable.");
          }
          return;
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (active) {
          setPdfBlobUrl(objectUrl);
        }
      } catch (error) {
        console.error("PDF fetch failed:", error);
        if (active) {
          setPdfBlobUrl("");
          setPdfError("PDF fetch failed");
        }
      }
    }

    loadPdf();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isPdf, fileUrl]);

  useEffect(() => {
    function resize() {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      setPageWidth(Math.max(320, width - 32));
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    if (!pageLayerRef.current) return;

    const pageEl =
      pageLayerRef.current.querySelector(".react-pdf__Page") as HTMLElement | null;

    if (!pageEl) return;

    const observer = new ResizeObserver(() => {
      setOverlayVersion((v) => v + 1);
    });

    observer.observe(pageEl);

    return () => observer.disconnect();
  }, [pdfBlobUrl, pageNumber, pageWidth]);

  function getOverlaySize() {
    const pageEl =
      pageLayerRef.current?.querySelector(".react-pdf__Page") as HTMLElement | null;

    if (pageEl) {
      const rect = pageEl.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
      };
    }

    return null;
  }

  function getPageRect() {
    const pageEl =
      pageLayerRef.current?.querySelector(".react-pdf__Page") as HTMLElement | null;

    if (!pageEl || !pageWrapRef.current) return null;

    const pageRect = pageEl.getBoundingClientRect();
    const wrapRect = pageWrapRef.current.getBoundingClientRect();

    return {
      left: pageRect.left - wrapRect.left,
      top: pageRect.top - wrapRect.top,
      width: pageRect.width,
      height: pageRect.height,
    };
  }

  function getRelativePoint(clientX: number, clientY: number) {
    const pageRect = getPageRect();
    const wrapRect = pageWrapRef.current?.getBoundingClientRect();
    if (!pageRect || !wrapRect) return null;

    return {
      x: clientX - wrapRect.left - pageRect.left,
      y: clientY - wrapRect.top - pageRect.top,
    };
  }

  function toDisplayBox(bbox: BBox): BBox {
    const size = getOverlaySize();
    if (!size) return bbox;

    const isNormalized =
      bbox.x >= 0 &&
      bbox.y >= 0 &&
      bbox.width >= 0 &&
      bbox.height >= 0 &&
      bbox.x <= 1 &&
      bbox.y <= 1 &&
      bbox.width <= 1 &&
      bbox.height <= 1;

    if (isNormalized) {
      return {
        x: bbox.x * size.width,
        y: bbox.y * size.height,
        width: bbox.width * size.width,
        height: bbox.height * size.height,
        page: bbox.page,
      };
    }

    return bbox;
  }

  function extractTextFromBBox(bbox: BBox): string {
    const textLayer =
      (pageLayerRef.current?.querySelector(
        ".react-pdf__Page__textContent"
      ) as HTMLElement | null) ||
      (pageLayerRef.current?.querySelector(
        ".react-pdf__Page__textContent.textLayer"
      ) as HTMLElement | null);

    const wrapRect = pageWrapRef.current?.getBoundingClientRect();
    const pageRect = getPageRect();

    if (!textLayer || !wrapRect || !pageRect) return "";

    const spans = Array.from(textLayer.querySelectorAll("span"));

    const padX = Math.min(4, bbox.width * 0.08);
    const padY = Math.min(3, bbox.height * 0.12);

    const innerBox = {
      left: bbox.x + padX,
      top: bbox.y + padY,
      right: bbox.x + bbox.width - padX,
      bottom: bbox.y + bbox.height - padY,
    };

    const words: { text: string; x: number; y: number }[] = [];

    spans.forEach((span) => {
      const el = span as HTMLElement;
      const rect = el.getBoundingClientRect();
      const text = (el.textContent || "").trim();

      if (!text) return;

      const x = rect.left - wrapRect.left - pageRect.left;
      const y = rect.top - wrapRect.top - pageRect.top;
      const w = rect.width;
      const h = rect.height;

      const centerX = x + w / 2;
      const centerY = y + h / 2;

      const inside =
        centerX >= innerBox.left &&
        centerX <= innerBox.right &&
        centerY >= innerBox.top &&
        centerY <= innerBox.bottom;

      if (inside) {
        words.push({ text, x, y });
      }
    });

    words.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 4) return a.y - b.y;
      return a.x - b.x;
    });

    return words.map((w) => w.text).join(" ").trim();
  }

  const visibleBoxes = useMemo(() => {
    const safeMappings = Array.isArray(mappings) ? mappings : [];

    const saved = safeMappings
      .filter(
        (m) =>
          m &&
          m.key &&
          m.bbox &&
          typeof m.bbox.x === "number" &&
          typeof m.bbox.y === "number" &&
          typeof m.bbox.width === "number" &&
          typeof m.bbox.height === "number"
      )
      .map((m) => ({
        key: m.key as string,
        bbox: toDisplayBox(m.bbox as BBox),
      }))
      .filter((m) => (m.bbox.page || 1) === pageNumber);

    const drafts = Object.entries(draftBoxes)
      .map(([key, bbox]) => ({
        key,
        bbox: toDisplayBox(bbox),
      }))
      .filter((m) => (m.bbox.page || 1) === pageNumber);

    const merged = [...saved];

    for (const d of drafts) {
      const idx = merged.findIndex((x) => x.key === d.key);
      if (idx >= 0) merged[idx] = d;
      else merged.push(d);
    }

    return merged;
  }, [mappings, draftBoxes, pageNumber, overlayVersion]);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!canEditBbox || !selectedField || !pdfBlobUrl) return;

    const p = getRelativePoint(e.clientX, e.clientY);
    if (!p) return;

    e.currentTarget.setPointerCapture?.(e.pointerId);

    setDrawing(true);
    setStartPoint(p);
    setDragBox({
      x: p.x,
      y: p.y,
      width: 0,
      height: 0,
      page: pageNumber,
    });
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drawing || !startPoint) return;

    const p = getRelativePoint(e.clientX, e.clientY);
    if (!p) return;

    setDragBox({
      x: Math.min(startPoint.x, p.x),
      y: Math.min(startPoint.y, p.y),
      width: Math.abs(p.x - startPoint.x),
      height: Math.abs(p.y - startPoint.y),
      page: pageNumber,
    });
  }

  function finishDrawing() {
    if (!dragBox || !selectedField) {
      setDrawing(false);
      setStartPoint(null);
      setDragBox(null);
      return;
    }

    const size = getOverlaySize();
    if (!size) {
      setDrawing(false);
      setStartPoint(null);
      setDragBox(null);
      return;
    }

    if (dragBox.width < 5 || dragBox.height < 5) {
      setDrawing(false);
      setStartPoint(null);
      setDragBox(null);
      return;
    }

    const extractedText = extractTextFromBBox(dragBox);

    const normalized: BBox = {
      x: dragBox.x / size.width,
      y: dragBox.y / size.height,
      width: dragBox.width / size.width,
      height: dragBox.height / size.height,
      page: pageNumber,
    };

    setDraftBoxes((prev) => ({
      ...prev,
      [selectedField]: normalized,
    }));

    onBBoxChange?.(selectedField, normalized, extractedText);

    setDrawing(false);
    setStartPoint(null);
    setDragBox(null);
  }

  function handlePointerUp() {
    finishDrawing();
  }

  const pageRect = getPageRect();

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        height: 620,
        border: "1px solid #dbe4ee",
        borderRadius: 10,
        overflow: "hidden",
        background: "#f8fafc",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {isPdf ? (
        <div
          style={{ height: "100%", display: "grid", gridTemplateRows: "44px 1fr" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              borderBottom: "1px solid #dbe4ee",
              background: "#fff",
            }}
          >
            <div style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>
              {fileName || "Original Document"}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                disabled={pageNumber <= 1}
                style={navBtn(pageNumber <= 1)}
              >
                Prev
              </button>

              <div
                style={{
                  fontSize: 12,
                  color: "#334155",
                  minWidth: 80,
                  textAlign: "center",
                }}
              >
                Page {pageNumber} / {numPages || 1}
              </div>

              <button
                type="button"
                onClick={() => setPageNumber((p) => Math.min(numPages || 1, p + 1))}
                disabled={pageNumber >= (numPages || 1)}
                style={navBtn(pageNumber >= (numPages || 1))}
              >
                Next
              </button>

              <a
                href={fileUrl || "#"}
                target="_blank"
                rel="noreferrer"
                style={{
                  border: "1px solid #dbe4ee",
                  background: fileUrl ? "#fff" : "#f8fafc",
                  color: fileUrl ? "#0f172a" : "#94a3b8",
                  borderRadius: 8,
                  padding: "6px 10px",
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  pointerEvents: fileUrl ? "auto" : "none",
                }}
                title="Download Original Document"
              >
                <FaDownload />
                Download
              </a>
            </div>
          </div>

          <div style={{ overflow: "auto", padding: 12 }}>
            {pdfBlobUrl ? (
              <div
                ref={pageWrapRef}
                style={{
                  position: "relative",
                  width: pageWidth,
                  margin: "0 auto",
                  background: "#fff",
                  boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
                }}
              >
                <div ref={pageLayerRef}>
                  <Document
                    file={pdfBlobUrl}
                    options={pdfOptions}
                    onLoadSuccess={({ numPages }) => {
                      setNumPages(numPages);
                      setPageNumber((prev) => Math.min(prev, numPages || 1));
                      setPdfError("");
                    }}
                    onLoadError={(err) => {
                      console.error("PDF LOAD ERROR:", err);
                      setPdfError("Unable to load PDF. Check cMaps / fonts.");
                    }}
                    loading={<ViewerPlaceholder text="Loading PDF..." />}
                    error={
                      <ViewerPlaceholder
                        text={pdfError || "Failed to load PDF file."}
                      />
                    }
                  >
                    <Page
                      pageNumber={pageNumber}
                      width={pageWidth}
                      renderAnnotationLayer={false}
                      renderTextLayer={true}
                    />
                  </Document>
                </div>

                <div
                  style={{
                    position: "absolute",
                    left: pageRect?.left ?? 0,
                    top: pageRect?.top ?? 0,
                    width: pageRect?.width ?? "100%",
                    height: pageRect?.height ?? "100%",
                    zIndex: 10,
                    pointerEvents: "auto",
                    cursor: canEditBbox && selectedField ? "crosshair" : "default",
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  {visibleBoxes.map((box) => {
                    const isSelected = selectedField === box.key;
                    const isHovered = hoveredField === box.key;

                    return (
                      <div
                        key={box.key}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectField?.(box.key);
                        }}
                        onMouseEnter={() => setHoveredField(box.key)}
                        onMouseLeave={() => setHoveredField(null)}
                        style={{
                          position: "absolute",
                          left: box.bbox.x,
                          top: box.bbox.y,
                          width: box.bbox.width,
                          height: box.bbox.height,
                          border: isSelected
                            ? "2px solid #0b5fff"
                            : isHovered
                            ? "2px solid #16a34a"
                            : "2px solid rgba(11,95,255,0.65)",
                          background: isSelected
                            ? "rgba(11,95,255,0.20)"
                            : isHovered
                            ? "rgba(22,163,74,0.16)"
                            : "rgba(11,95,255,0.10)",
                          boxSizing: "border-box",
                          borderRadius: 4,
                          pointerEvents: "auto",
                          transition: "all 120ms ease",
                        }}
                        title={box.key}
                      />
                    );
                  })}

                  {dragBox && (
                    <div
                      style={{
                        position: "absolute",
                        left: dragBox.x,
                        top: dragBox.y,
                        width: dragBox.width,
                        height: dragBox.height,
                        border: "2px dashed #0b5fff",
                        background: "rgba(11,95,255,0.08)",
                        boxSizing: "border-box",
                        pointerEvents: "none",
                      }}
                    />
                  )}
                </div>
              </div>
            ) : (
              <ViewerPlaceholder text={pdfError || "Loading PDF..."} />
            )}
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: 14,
            height: "100%",
            overflow: "auto",
            whiteSpace: "pre-wrap",
            color: "#334155",
            fontSize: 13,
            background: "#fff",
          }}
        >
          {rawText || "No document available"}
        </div>
      )}
    </div>
  );
}

function ViewerPlaceholder({ text }: { text: string }) {
  return (
    <div
      style={{
        height: 500,
        display: "grid",
        placeItems: "center",
        color: "#64748b",
        fontSize: 14,
        background: "#fff",
      }}
    >
      {text}
    </div>
  );
}

function navBtn(disabled: boolean): React.CSSProperties {
  return {
    border: "1px solid #dbe4ee",
    background: disabled ? "#f8fafc" : "#fff",
    color: disabled ? "#94a3b8" : "#0f172a",
    borderRadius: 8,
    padding: "6px 10px",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 12,
    fontWeight: 700,
  };
}
