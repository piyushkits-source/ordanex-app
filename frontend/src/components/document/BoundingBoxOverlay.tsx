import { useMemo, useRef, useState } from "react";
import type { FieldBox } from "./types";

interface Props {
  page: number;
  scale?: number;
  boxes?: FieldBox[];
  selectedField?: string | null;
  onSelectField?: (field: string) => void;
  onBoxesChange?: (boxes: FieldBox[]) => void;
  editable?: boolean;
}

interface DraftBox {
  page: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export default function BoundingBoxOverlay({
  page,
  scale = 1,
  boxes = [],
  selectedField,
  onSelectField,
  onBoxesChange,
  editable = false,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<DraftBox | null>(null);

  const pageBoxes = useMemo(() => boxes.filter((box) => box.page === page), [boxes, page]);

  const normalizedDraft = useMemo(() => {
    if (!draft) return null;
    const x = Math.min(draft.startX, draft.endX);
    const y = Math.min(draft.startY, draft.endY);
    const width = Math.abs(draft.endX - draft.startX);
    const height = Math.abs(draft.endY - draft.startY);
    return { x, y, width, height, page };
  }, [draft, page]);

  const getCoords = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: (event.clientX - rect.left) / scale,
      y: (event.clientY - rect.top) / scale,
    };
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!editable || !selectedField) return;
    const coords = getCoords(event);
    if (!coords) return;
    setDraft({
      page,
      startX: coords.x,
      startY: coords.y,
      endX: coords.x,
      endY: coords.y,
    });
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!editable || !draft) return;
    const coords = getCoords(event);
    if (!coords) return;
    setDraft((prev) => (prev ? { ...prev, endX: coords.x, endY: coords.y } : prev));
  };

  const handleMouseUp = () => {
    if (!editable || !draft || !selectedField || !normalizedDraft) {
      setDraft(null);
      return;
    }
    if (normalizedDraft.width < 3 || normalizedDraft.height < 3) {
      setDraft(null);
      return;
    }
    const next = [
      ...boxes.filter((b) => !(b.page === page && andEqualsField(b.field, selectedField))),
      {
        field: selectedField,
        page,
        x: normalizedDraft.x,
        y: normalizedDraft.y,
        width: normalizedDraft.width,
        height: normalizedDraft.height,
      },
    ];
    onBoxesChange?.(next);
    setDraft(null);
  };

  return (
    <div
      ref={ref}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        position: "absolute",
        inset: 0,
        cursor: editable && selectedField ? "crosshair" : "default",
      }}
    >
      {pageBoxes.map((box, index) => (
        <button
          key={`${box.field}-${box.page}-${index}`}
          type="button"
          title={box.field}
          onClick={(event) => {
            event.stopPropagation();
            onSelectField?.(box.field);
          }}
          style={{
            position: "absolute",
            left: box.x * scale,
            top: box.y * scale,
            width: box.width * scale,
            height: box.height * scale,
            border: `2px solid ${box.field === selectedField ? "#ef4444" : "#3b82f6"}`,
            background: box.field === selectedField ? "rgba(239,68,68,0.10)" : "rgba(59,130,246,0.10)",
            borderRadius: 4,
            cursor: "pointer",
          }}
        />
      ))}

      {normalizedDraft ? (
        <div
          style={{
            position: "absolute",
            left: normalizedDraft.x * scale,
            top: normalizedDraft.y * scale,
            width: normalizedDraft.width * scale,
            height: normalizedDraft.height * scale,
            border: "2px dashed #10b981",
            background: "rgba(16,185,129,0.12)",
            borderRadius: 4,
          }}
        />
      ) : null}
    </div>
  );
}

function && andEqualsField(left: string, right: string) {
  return left === right;
}