export type OrderUrgency = "overdue" | "due_today" | "delivered_today" | "tomorrow" | "two_or_more_days" | "on_time";
export type OrderSource = "falabella" | "mercadolibre" | "shopify" | "walmart" | "paris";
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
  order_ids_with_cases?: string[];
}

export interface BreakdownItem {
  source: string;
  method: string;  // "Express" | "Direct/Flex" | "Regular/Centro Envíos"
  count: number;
}

export interface DashboardSummary {
  total_orders: number;
  overdue_count: number;
  due_today_count: number;
  delivered_today_count: number;
  tomorrow_count: number;
  two_or_more_days_count: number;
  on_time_count: number;
  last_sync_at: string | null;
  sources: OrderSource[];
  breakdown?: Record<string, BreakdownItem[]>;
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
  delayed_weekly: DelayMetric[];
  on_time_weekly: OnTimeMetric[];
}

export interface OrderCase {
  id: string;
  delayed_order_id?: string | null;
  order_id?: string | null;
  case_number?: string | null;
  case_status?: string | null;
  comments?: string | null;
  created_at: string;
}

export interface ActiveOrderWithCases {
  order: Order;
  cases: OrderCase[];
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
  status?: string | null;
  raw_data?: Record<string, unknown>;
  comprobante?: string | null;
  case_number?: string | null;
  comments?: string | null;
  case_status?: string | null;
  cases?: OrderCase[];
}

export interface HistoricalOrdersPage {
  data: HistoricalOrder[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface KpiPeriod {
  period: string;
  total: number;
  delayed: number;
  pct_delayed: number;
}

export interface KpiMetrics {
  monthly: KpiPeriod[];
  weekly: KpiPeriod[];
}

export interface CESchedule {
  value: Record<string, string>;  // {"monday":"11:00","thursday":"14:45",...}
  updated_at: string | null;
}
