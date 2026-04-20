import { apiClient } from "./apiClient";

export async function login(email: string, password: string) {
  const { data } = await apiClient.post("/auth/login", { email, password });
  return data as { access_token: string };
}