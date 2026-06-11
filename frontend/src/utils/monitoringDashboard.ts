export type DashboardSummaryPoint = {
  label: string;
  value: number;
  color?: string;
};

export type DashboardExceptionRow = {
  po_id: string;
  po_number?: string | null;
  status?: string | null;
  client_id?: string | null;
  sender?: string | null;
  receiver?: string | null;
  source_type?: string | null;
  connector_used?: string | null;
  created_at?: string | null;
  processed_at?: string | null;
  reason?: string | null;
};

export type DashboardDailyPoint = {
  date: string;
  total: number;
  success: number;
  failed: number;
  pending: number;
};

export type MonitoringQueueDashboardRow = {
  po_id: string;
  client_id?: string | null;
  po_number?: string | null;
  status?: string | null;
  sender?: string | null;
  receiver?: string | null;
  supplier_name?: string | null;
  source_type?: string | null;
  created_at?: string | null;
  processed_at?: string | null;
};

export type DashboardSummary = {
  environment: string;
  total: number;
  success: number;
  failed: number;
  pending: number;
  by_connector: Record<string, number>;
  by_status: Record<string, number>;
  daily_volume: DashboardDailyPoint[];
  manual_touch_count: number;
  auto_processed_count: number;
  manual_touch_rate: number;
  avg_processing_latency_hours: number;
  top_clients: DashboardSummaryPoint[];
  top_suppliers: DashboardSummaryPoint[];
  recent_exceptions: DashboardExceptionRow[];
};

const SUCCESS_STATUSES = new Set([
  "SUCCESS",
  "PROCESSED",
  "DELIVERED",
  "REPROCESSED",
  "COMPLETED",
  "INVOICED",
  "PAID",
  "SHIPPED",
]);

const FAILED_STATUSES = new Set([
  "ERROR",
  "FAILED",
  "DELIVERY_FAILED",
  "BLOCKED",
  "REJECTED",
  "CANCELLED",
]);

const PENDING_STATUSES = new Set([
  "PENDING",
  "NEW",
  "PARSED",
  "CORRECTED",
  "PROCESSING",
  "REPROCESSING",
  "ORDER_RECEIVED",
  "PAYMENT_PENDING",
  "AWAITING_SUPPLIER_INVOICE",
]);

function classifyStatus(status?: string | null) {
  const normalized = String(status || "UNKNOWN").trim().toUpperCase();
  if (SUCCESS_STATUSES.has(normalized)) return "success";
  if (FAILED_STATUSES.has(normalized)) return "failed";
  if (PENDING_STATUSES.has(normalized)) return "pending";
  return "other";
}

function isoDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] || 0) + 1;
}

export function buildDashboardSummaryFromQueue(
  rows: MonitoringQueueDashboardRow[],
  environment: string,
): DashboardSummary {
  const byConnector: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const topClients: Record<string, number> = {};
  const topSuppliers: Record<string, number> = {};
  const recentExceptions: DashboardExceptionRow[] = [];
  const dailyMap: Record<string, DashboardDailyPoint> = {};
  const processingLatencyHours: number[] = [];
  let manualTouchCount = 0;
  let autoProcessedCount = 0;

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    dailyMap[key] = { date: key, total: 0, success: 0, failed: 0, pending: 0 };
  }

  rows.forEach((row) => {
    const status = String(row.status || "UNKNOWN").trim().toUpperCase();
    increment(byStatus, status);
    increment(byConnector, String(row.source_type || "UNKNOWN").trim().toUpperCase());

    const clientLabel = String(row.receiver || row.client_id || "UNKNOWN").trim() || "UNKNOWN";
    increment(topClients, clientLabel);
    const supplierLabel = String(row.supplier_name || row.sender || row.receiver || "UNKNOWN").trim() || "UNKNOWN";
    increment(topSuppliers, supplierLabel);

    const createdAt = isoDate(row.created_at);
    const processedAt = isoDate(row.processed_at);
    const statusGroup = classifyStatus(status);
    if (createdAt) {
      const dayKey = createdAt.toISOString().slice(0, 10);
      const bucket = dailyMap[dayKey];
      if (bucket) {
        bucket.total += 1;
        if (statusGroup === "success") bucket.success += 1;
        if (statusGroup === "failed") bucket.failed += 1;
        if (statusGroup === "pending") bucket.pending += 1;
      }
    }

    if (statusGroup === "failed" || status === "CORRECTED") manualTouchCount += 1;
    else autoProcessedCount += 1;

    if (createdAt && processedAt) {
      const diff = Math.max((processedAt.getTime() - createdAt.getTime()) / 3600000, 0);
      processingLatencyHours.push(diff);
    }

    if (statusGroup === "failed" || status === "CORRECTED") {
      recentExceptions.push({
        po_id: row.po_id,
        po_number: row.po_number,
        status,
        client_id: row.client_id,
        sender: row.sender,
        receiver: row.receiver,
        source_type: row.source_type,
        connector_used: row.source_type,
        created_at: row.created_at || null,
        processed_at: row.processed_at || null,
        reason: null,
      });
    }
  });

  recentExceptions.sort((a, b) => String(b.processed_at || b.created_at || "").localeCompare(String(a.processed_at || a.created_at || "")));

  const total = rows.length;
  const success = Object.entries(byStatus).reduce((acc, [status, value]) => acc + (SUCCESS_STATUSES.has(status) ? value : 0), 0);
  const failed = Object.entries(byStatus).reduce((acc, [status, value]) => acc + (FAILED_STATUSES.has(status) ? value : 0), 0);
  const pending = Object.entries(byStatus).reduce((acc, [status, value]) => acc + (PENDING_STATUSES.has(status) ? value : 0), 0);

  const avgLatency = processingLatencyHours.length
    ? Math.round((processingLatencyHours.reduce((acc, value) => acc + value, 0) / processingLatencyHours.length) * 100) / 100
    : 0;

  const toTopPoints = (input: Record<string, number>) => Object.entries(input)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value]) => ({ label, value }));

  return {
    environment,
    total,
    success,
    failed,
    pending,
    by_connector: byConnector,
    by_status: byStatus,
    daily_volume: Object.values(dailyMap),
    manual_touch_count: manualTouchCount,
    auto_processed_count: autoProcessedCount,
    manual_touch_rate: total ? Math.round((manualTouchCount / total) * 10000) / 100 : 0,
    avg_processing_latency_hours: avgLatency,
    top_clients: toTopPoints(topClients),
    top_suppliers: toTopPoints(topSuppliers),
    recent_exceptions: recentExceptions.slice(0, 10),
  };
}
