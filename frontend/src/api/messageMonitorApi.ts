import { apiClient } from "./apiClient";

type MonitoringQueueParams = {
  environment: string;
  direction?: string;
  status?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  from_date?: string;
  to_date?: string;
};

export async function getMonitoringQueue(params: MonitoringQueueParams) {
  const normalizedParams = {
    environment: params.environment,
    direction: params.direction,
    status_filter: params.status,
    search: params.search,
    from_date: params.from_date ?? params.fromDate,
    to_date: params.to_date ?? params.toDate,
  };

  const { data } = await apiClient.get("/monitoring/queue", {
    params: normalizedParams,
  });

  return Array.isArray(data) ? data : [];
}

export async function getActivityLogs(poId: string) {
  const { data } = await apiClient.get(`/monitoring/${poId}/activity-logs`);
  return Array.isArray(data) ? data : [];
}

export async function getProcessingFlow(poId: string) {
  const { data } = await apiClient.get(`/monitoring/${poId}/processing-flow`);
  return Array.isArray(data) ? data : [];
}