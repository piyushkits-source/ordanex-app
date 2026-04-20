import { apiClient } from "./apiClient";
export async function getAppMenu() {
  const { data } = await apiClient.get("/app/menu");
  return data as Array<{ label: string; path: string; icon: string }>;
}
