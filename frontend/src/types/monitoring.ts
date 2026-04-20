export type EnvironmentType = "PROD" | "STAGING";
export type DirectionType = "ALL" | "INBOUND" | "OUTBOUND";
export type StatusFilter = "ALL" | "PROCESSED" | "PENDING" | "FAILED" | "ARCHIVED";
export type RightPanelTab = "FIELDS" | "ACTIVITY_LOGS" | "PROCESSING_FLOW";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  page?: number;
}

export interface MappingField {
  key: string;
  label: string;
  value: string;
  bbox?: BoundingBox | null;
}

export interface PartnerResolution {
  code?: string | null;
  name?: string | null;
  address?: string | null;
  matched?: boolean;
}

export interface LineItem {
  id?: string;
  line_no?: string | number | null;
  material_code?: string | null;
  description?: string | null;
  quantity?: string | number | null;
  customer_uom?: string | null;
  supplier_uom?: string | null;
  supplier_uom_conversion_factor?: string | number | null;
  uom?: string | null;
  unit_price?: string | number | null;
  amount?: string | number | null;
  delivery_date?: string | null;
}

export interface MonitoringRow {
  po_id: string;
  file_id?: string | null;
  client_id: string;
  po_number?: string | null;
  po_date?: string | null;
  docnum?: string | null;
  supplier_name?: string | null;
  status?: string | null;
  sender?: string | null;
  receiver?: string | null;
  direction?: string | null;
  environment?: string | null;
  source_type?: string | null;
  created_at?: string | null;
  received_at?: string | null;
  file_url?: string | null;
  mime_type?: string | null;
  file_name?: string | null;
  raw_text?: string | null;
  xml_payload?: string | null;
  items?: LineItem[];
  mappings?: MappingField[];
  sold_to_partner?: PartnerResolution | null;
  ship_to_partner?: PartnerResolution | null;
  delivery_partner?: PartnerResolution | null;
}

export interface ActivityLog {
  id: string;
  stage: string;
  level: string;
  message: string;
  actor_type?: string;
  actor_email?: string | null;
  changed_fields?: Record<string, { old: string; new: string }> | null;
  recipients?: string[] | null;
  timestamp: string;
}

export interface ProcessingStep {
  id: string;
  name: string;
  status: string;
  timestamp?: string | null;
  details?: string | null;
}
