import type { EnvironmentType } from "./common";

export interface ConnectorConfig {
  connector_config_id: string;
  client_id: string;
  connector_type: string;
  direction: "INBOUND" | "OUTBOUND";
  protocol: string;
  config_name: string;
  config_json: Record<string, unknown>;
  is_active: boolean;
  test_status?: string | null;
  environment: EnvironmentType;
}