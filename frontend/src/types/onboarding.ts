export type PreviewRow = {
  row_number: number;
  partner_code: string;
  partner_name: string;
  partner_type: string;
  status: string;
  connection_method?: string;
  errors: string[];
  is_valid: boolean;
};

export type PreviewSummary = {
  total_rows: number;
  valid_count: number;
  invalid_count: number;
  rows?: PreviewRow[];
  error_rows?: any[];
};
