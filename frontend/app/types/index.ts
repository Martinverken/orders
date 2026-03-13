export type OrderUrgency = "overdue" | "due_today" | "delivered_today" | "tomorrow" | "two_or_more_days" | "on_time";
export type OrderSource = "falabella" | "mercadolibre" | "shopify" | "walmart" | "paris";
export type SyncStatus = "running" | "success" | "error";

export type Perspective = "bodega" | "cliente";

export interface Order {
  id: string;
  external_id: string;
  source: OrderSource;
  status: string;
  created_at_source?: string | null;
  limit_delivery_date: string;
  limit_handoff_date?: string | null;
  urgency: OrderUrgency;
  product_name?: string | null;
  product_quantity?: number | null;
  first_shipped_at?: string | null;
  synced_at: string;
  updated_at: string;
  raw_data?: Record<string, unknown>;
  // Welivery enrichment (from yesterday-delays endpoint)
  welivery_status?: string | null;
  welivery_depot_at?: string | null;
  welivery_delivered_at?: string | null;
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

export interface BlameCounts {
  bodega: number;
  transportista: number;
  bodega_recent: number;
  transportista_recent: number;
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
  blame_counts?: BlameCounts;
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
  limit_handoff_date?: string | null;
  resolved_at: string;
  delivered_at?: string | null;
  handoff_at?: string | null;
  days_delayed: number;
  logistics_operator?: string | null;
  urgency?: string | null;
  status?: string | null;
  blame?: string | null;  // 'bodega' | 'transportista'
  raw_data?: Record<string, unknown>;
  // Welivery enrichment (from yesterday-delays endpoint)
  welivery_status?: string | null;
  welivery_depot_at?: string | null;
  welivery_delivered_at?: string | null;
  comprobante?: string | null;
  case_number?: string | null;
  comments?: string | null;
  case_status?: string | null;
  cases?: OrderCase[];
  _active?: boolean;
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
  bodega: number;
  transportista: number;
}

export interface KpiDetailPeriod extends KpiPeriod {
  source: string;
  method: string;
}

export interface KpiMetrics {
  monthly: KpiPeriod[];
  weekly: KpiPeriod[];
  monthly_detail: KpiDetailPeriod[];
  weekly_detail: KpiDetailPeriod[];
}

export interface YesterdayDelays {
  date: string;
  archived_delayed: HistoricalOrder[];
  archived_delayed_count: number;
  active_overdue: Order[];
  active_overdue_count: number;
  total: number;
}

export interface DailyDelaysDay {
  date: string;
  orders: HistoricalOrder[];
  count: number;
}

export interface DailyDelays {
  days: DailyDelaysDay[];
  total: number;
}

export interface CESchedule {
  value: Record<string, string>;  // {"monday":"11:00","thursday":"14:45",...}
  updated_at: string | null;
}

export interface BultoDims {
  height_cm?: number | null;
  width_cm?: number | null;
  length_cm?: number | null;
  weight_kg?: number | null;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  brand?: string | null;
  category?: string | null;
  height_cm?: number | null;
  width_cm?: number | null;
  length_cm?: number | null;
  weight_kg?: number | null;
  image_url?: string | null;
  num_bultos: number;
  is_service: boolean;
  is_pack: boolean;
  bultos_dims?: BultoDims[] | null;
  created_at: string;
  updated_at: string;
}

export interface ProductsPage {
  data: Product[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface Courier {
  id: string;
  name: string;
  pricing_type?: string | null;
  base_price?: number | null;
  price_per_kg?: number | null;
  max_weight_kg?: number | null;
  max_length_cm?: number | null;
  max_width_cm?: number | null;
  max_height_cm?: number | null;
  notes?: string | null;
  active: boolean;
  pickup_cutoff?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WarehouseCarrierSummary {
  carrier: string;
  overdue: number;
  due_today: number;
  pickup_cutoff: string | null;
}
