import { apiClient } from "./apiClient";
export async function getClientConfig(clientId: string) {
  const { data } = await apiClient.get(`/clients/${clientId}/config`);
  return data as Record<string, unknown>;
}
