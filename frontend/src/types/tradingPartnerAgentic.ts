export type MessageFamily = "PURCHASE_ORDER" | "ORDER_RESPONSE" | "ORDER_CHANGE" | "ASN" | "INVOICE";
export type MessageStandard = "PAPER_PO" | "EDIFACT" | "X12" | "XML" | "JSON" | "CSV" | "EMAIL_BODY";

export type AgenticOnboardingProject = {
  project_id: string;
  client_id: string;
  partner_id: string;
  profile_name: string;
  message_family: MessageFamily;
  message_standard: MessageStandard;
  message_version?: string | null;
  direction: "INBOUND" | "OUTBOUND" | "BOTH";
  target_message_family: string;
  extraction_mode: string;
  status: string;
};
