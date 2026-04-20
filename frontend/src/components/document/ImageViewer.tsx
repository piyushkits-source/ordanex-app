import BoundingBoxOverlay from "./BoundingBoxOverlay";
import type { ViewerBaseProps } from "./types";

interface Props extends ViewerBaseProps {
  editable?: boolean;
  width?: number;
}

export default function ImageViewer({
  fileUrl,
  boxes,
  selectedField,
  onSelectField,
  onBoxesChange,
  editable = false,
  width = 900,
}: Props) {
  if (!fileUrl) {
    return <div style={{ padding: 16 }}>No image file URL provided.</div>;
  }

  return (
    <div style={{ position: "relative", width, maxWidth: "100%" }}>
      <img src={fileUrl} alt="Document preview" style={{ width: "100%", display: "block", borderRadius: 12 }} />
      <BoundingBoxOverlay
        page={1}
        scale={1}
        boxes={boxes}
        selectedField={selectedField}
        onSelectField={onSelectField}
        onBoxesChange={onBoxesChange}
        editable={editable}
      />
    </div>
  );
}