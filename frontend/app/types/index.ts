export type OrderUrgency = "overdue" | "due_today" | "delivered_today" | "tomorrow" | "on_time";
export type OrderSource = "falabella" | "mercadolibre";
export type SyncStatus = "running" | "success" | "error";

export interface Order {
  id: string;
  external_id: string;
  source: OrderSource;
  status: string;
  created_at_source?: string | null;
  limit_delivery_date: string;
  urgency: OrderUrgency;
  product_name?: string | null;
  product_quantity?: number | null;
  synced_at: string;
  updated_at: string;
  raw_data?: Record<string, unknown>;
}

export interface OrdersPage {
  data: Order[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface DashboardSummary {
  total_orders: number;
  overdue_count: number;
  due_today_count: number;
  delivered_today_count: number;
  tomorrow_count: number;
  on_time_count: number;
  last_sync_at: string | null;
  sources: OrderSource[];
}

export interface SyncLog {
  id: string;
  source: string;
  status: SyncStatus;
  orders_fetched: number;
  orders_upserted: number;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
}

export interface SyncStatusResponse {
  success: boolean;
  last_sync: SyncLog | null;
  recent_logs: SyncLog[];
}

export interface OnTimeMetric {
  month: string;
  source: string;
  logistics_operator: string;
  count: number;
}

export interface DelayMetric {
  month: string;
  source: string;
  logistics_operator: string;
  count: number;
  avg_days_delayed: number;
}

export interface HistoricalMetrics {
  delayed: DelayMetric[];
  on_time: OnTimeMetric[];
}

export interface HistoricalOrder {
  id: string;
  external_id: string;
  source: OrderSource;
  limit_delivery_date: string;
  resolved_at: string;
  delivered_at?: string | null;
  days_delayed: number;
  logistics_operator?: string | null;
  urgency?: string | null;
  raw_data?: Record<string, unknown>;
}

export interface HistoricalOrdersPage {
  data: HistoricalOrder[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}
