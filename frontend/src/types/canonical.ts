
export type CanonicalMeta = {
  document_type: string;
  message_direction: "INBOUND" | "OUTBOUND";
  source_format: string;
  source_standard?: string | null;
  source_message_type?: string | null;
  source_version?: string | null;
  target_erp?: string | null;
  target_standard?: string | null;
  target_message_type?: string | null;
  target_version?: string | null;
  flow_id?: string | null;
  client_id?: string | null;
  vertical_id?: string | null;
  partner_id?: string | null;
  source_document_id?: string | null;
};

export type CanonicalParty = {
  partner_name?: string | null;
  partner_code?: string | null;
  identifier_type?: string | null;
  external_ids?: Record<string, string | null>;
};

export type CanonicalReference = { reference_type: string; reference_number: string };
export type CanonicalDate = { date_type: string; date_value: string };

export type CanonicalAddress = {
  address_role: string;
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  resolved_master_id?: string | null;
  resolved_codes?: Record<string, string | null>;
  match_score?: number | null;
};

export type CanonicalScheduleLine = {
  schedule_number?: string | null;
  quantity?: number | null;
  uom?: string | null;
  delivery_date?: string | null;
};

export type CanonicalItem = {
  line_number?: string | null;
  buyer_product_code?: string | null;
  supplier_product_code?: string | null;
  internal_material_code?: string | null;
  gtin?: string | null;
  description?: string | null;
  ordered_quantity?: number | null;
  ordered_uom?: string | null;
  normalized_quantity?: number | null;
  normalized_uom?: string | null;
  unit_price?: number | null;
  price_basis_quantity?: number | null;
  price_basis_uom?: string | null;
  currency_code?: string | null;
  requested_delivery_date?: string | null;
  plant_code?: string | null;
  storage_location?: string | null;
  customer_line_reference?: string | null;
  notes?: string | null;
  schedule_lines?: CanonicalScheduleLine[];
  raw_extensions?: Record<string, unknown>;
};

export type CanonicalDocument = {
  meta: CanonicalMeta;
  header: Record<string, unknown>;
  parties: Record<string, CanonicalParty>;
  references: CanonicalReference[];
  dates: CanonicalDate[];
  addresses: CanonicalAddress[];
  items: CanonicalItem[];
  totals: Record<string, unknown>;
  attachments: Array<Record<string, unknown>>;
  raw_extensions: Record<string, unknown>;
};
