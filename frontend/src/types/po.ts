import type { EnvironmentType } from "./common";

export interface PurchaseOrderItem {
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
}

export interface PurchaseOrder {
  po_id: string;
  client_id: string;
  file_id?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  po_number?: string | null;
  po_date?: string | null;
  supplier_name?: string | null;
  currency?: string | null;
  sold_to?: string | null;
  ship_to?: string | null;
  status: string;
  source_type: string;
  sender?: string | null;
  receiver?: string | null;
  direction?: string | null;
  environment?: EnvironmentType | null;
  received_at?: string | null;
  processed_at?: string | null;
  delivered_at?: string | null;
  po_validation_reason?: string | null;
  xml_payload?: string | null;
  raw_text?: string | null;
  file_url?: string | null;
  items: PurchaseOrderItem[];
}