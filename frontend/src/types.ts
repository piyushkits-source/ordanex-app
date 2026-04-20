export type Environment = "PROD" | "STAGING";

export type PurchaseOrderItem = {
  po_item_id?: string;
  line_no: number;
  material_code?: string | null;
  description?: string | null;
  quantity?: number | null;
  uom?: string | null;
  unit_price?: number | null;
  amount?: number | null;
  delivery_date?: string | null;
  plant?: string | null;
  is_corrected?: boolean;
};

export type PurchaseOrder = {
  po_id: string;
  client_id: string;
  po_number?: string | null;
  original_po_number?: string | null;
  docnum?: string | null;
  po_date?: string | null;
  supplier_name?: string | null;
  currency?: string | null;
  po_type?: string | null;
  order_type?: string | null;
  sold_to?: string | null;
  ship_to?: string | null;
  status?: string | null;
  source_type?: string | null;
  po_confidence?: string | null;
  po_validation_reason?: string | null;
  xml_payload?: string | null;
  raw_text?: string | null;
  total_items?: number | null;
  retry_count?: number | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  sender?: string | null;
  receiver?: string | null;
  direction?: string | null;
  environment?: string | null;
  received_at?: string | null;
  processed_at?: string | null;
  delivered_at?: string | null;
  items?: PurchaseOrderItem[];
};

export type FileInfo = { file_id: string; original_file_name: string; file_path?: string | null; };
export type PoFileInfoResponse = { po_id: string; po_number?: string | null; file: FileInfo | null; };

export type PoLog = {
  log_id: string;
  po_id: string;
  client_id: string;
  level: string;
  stage: string;
  message: string;
  error_type?: string | null;
  created_by?: string | null;
  log_time: string;
};

export type EmailHistoryRow = {
  po_id?: string | null;
  event_type?: string | null;
  recipients?: string | null;
  subject?: string | null;
  status?: string | null;
  response_message?: string | null;
  created_by?: string | null;
  created_at?: string | null;
};
