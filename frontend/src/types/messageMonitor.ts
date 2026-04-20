export type EnvironmentType = "STAGING" | "PRODUCTION";
export type DirectionType = "ALL" | "INBOUND" | "OUTBOUND";
export type StatusType = "ALL" | "SUCCESSFUL" | "ERROR" | "IN_PROGRESS" | "PENDING" | "ARCHIVED";

export interface LineItem {
  id: string;
  material: string;
  description: string;
  quantity: string;
  uom: string;
  price: string;
}

export interface MonitorFieldValue {
  key: string;
  label: string;
  value: string;
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface MonitorRow {
  id: string;
  status: "SUCCESSFUL" | "ERROR" | "IN_PROGRESS" | "PENDING" | "ARCHIVED";
  documentId: string;
  messageType: string;
  sender: string;
  receiver: string;
  transactionNumber: string;
  direction: "INBOUND" | "OUTBOUND";
  environment: EnvironmentType;
  receivedAt: string;
  fileUrl?: string;
  fileName?: string;
  mimeType?: string;
  rawText?: string;
  transformedXml?: string;
  fields: MonitorFieldValue[];
  lineItems: LineItem[];
}