import { apiClient } from "./apiClient";
export async function listConnectors() {
  const { data } = await apiClient.get("/connectors");
  return data as Array<Record<string, unknown>>;
}
