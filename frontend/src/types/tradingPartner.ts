export type TradingPartner = {
  partner_id: string;
  client_id: string;
  vertical_id?: string | null;
  partner_code: string;
  partner_name: string;
  partner_type: string;
  status: string;
  connection_method?: string | null;
  email?: string | null;
  edi_id?: string | null;
  sftp_path?: string | null;
  as2_id?: string | null;
  api_reference?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PartnerProfile = {
  onboarding_profile_id?: string;
  client_id: string;
  partner_id: string;
  profile_name?: string;
  profile_status?: string;
  duplicate_check_enabled: boolean;
  duplicate_check_scope: string;
  split_rule: string;
  split_po_number_strategy: string;
  split_po_separator: string;
  delivery_date_source: string;
  delivery_date_offset_type: string;
  delivery_date_offset_days: number;
  po_date_source: string;
  max_split_quantity?: number;
  max_split_uom?: string;
  split_quantity_basis?: string;
  split_rounding_mode?: string;
  split_po_prefix?: string;
  split_po_suffix?: string;
  split_po_format?: string;
  created_at?: string;
  updated_at?: string;
};

export type PartnerConnection = {
  connection_id?: string;
  client_id: string;
  partner_id: string;
  connection_name: string;
  connection_type: string;
  direction: string;
  message_type?: string | null;
  message_version?: string | null;
  config_json: Record<string, any>;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};
