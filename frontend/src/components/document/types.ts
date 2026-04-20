export interface FieldBox {
  id?: string;
  field: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewerBaseProps {
  fileUrl?: string;
  rawText?: string;
  mimeType?: string;
  fileName?: string;
  boxes?: FieldBox[];
  selectedField?: string | null;
  onSelectField?: (field: string) => void;
  onBoxesChange?: (boxes: FieldBox[]) => void;
}