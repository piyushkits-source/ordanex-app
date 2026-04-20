export type MessageFlow = {
  flow_id?: string;
  client_id: string;
  vertical_id?: string | null;
  partner_id: string;

  flow_name: string;
  is_active: boolean;
  priority: number;

  document_type: string;
  message_direction: string;

  source_format: string;
  source_message_standard?: string | null;
  source_message_type?: string | null;
  source_message_version?: string | null;

  target_erp: string;
  target_message_standard: string;
  target_message_type: string;
  target_message_version?: string | null;

  target_connection_id?: string | null;

  mapping_profile_id?: string | null;
  rules_profile_id?: string | null;
  uom_profile_id?: string | null;
  address_profile_id?: string | null;
  parser_profile_id?: string | null;
  validation_profile_id?: string | null;

  requires_review_on_error: boolean;
  auto_send_on_success: boolean;
  allow_partial_processing: boolean;
  archive_mode?: string | null;

  flow_notes?: string | null;
};
