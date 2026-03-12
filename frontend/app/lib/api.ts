import { ActiveOrderWithCases, CESchedule, Courier, DailyDelays, DashboardSummary, HistoricalMetrics, HistoricalOrdersPage, KpiMetrics, Order, OrderCase, OrdersPage, Product, ProductsPage, SyncStatusResponse, YesterdayDelays } from "@/app/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`API error ${res.status}: ${error}`);
  }
  return res.json();
}

interface OrderFilters {
  source?: string;
  status?: string;
  urgency?: string;
  product_name?: string;
  logistics_operator?: string;
  city?: string;
  commune?: string;
  order_number?: string;
  perspective?: string;
}

function buildFilterQuery(filters: OrderFilters): URLSearchParams {
  const query = new URLSearchParams();
  if (filters.source) query.set("source", filters.source);
  if (filters.status) query.set("status", filters.status);
  if (filters.urgency) query.set("urgency", filters.urgency);
  if (filters.product_name) query.set("product_name", filters.product_name);
  if (filters.logistics_operator) query.set("logistics_operator", filters.logistics_operator);
  if (filters.city) query.set("city", filters.city);
  if (filters.commune) query.set("commune", filters.commune);
  if (filters.order_number) query.set("order_number", filters.order_number);
  if (filters.perspective) query.set("perspective", filters.perspective);
  return query;
}

export async function getDashboardSummary(filters?: OrderFilters): Promise<DashboardSummary> {
  const query = buildFilterQuery(filters || {});
  const qs = query.toString();
  const data = await apiFetch<{ success: boolean; data: DashboardSummary }>(`/api/dashboard/summary${qs ? `?${qs}` : ""}`);
  return data.data;
}

export async function getOrders(params?: OrderFilters & { page?: number; per_page?: number }): Promise<OrdersPage> {
  const query = buildFilterQuery(params || {});
  if (params?.page) query.set("page", String(params.page));
  if (params?.per_page) query.set("per_page", String(params.per_page));
  return apiFetch<OrdersPage>(`/api/orders?${query}`);
}

export async function getDistinctCities(): Promise<string[]> {
  const data = await apiFetch<{ success: boolean; data: string[] }>("/api/orders/cities");
  return data.data;
}

export async function getDistinctCommunes(city?: string): Promise<string[]> {
  const qs = city ? `?city=${encodeURIComponent(city)}` : "";
  const data = await apiFetch<{ success: boolean; data: string[] }>(`/api/orders/communes${qs}`);
  return data.data;
}

export async function getHistoricalOrders(params?: {
  source?: string;
  urgency?: string;
  logistics_operator?: string;
  city?: string;
  commune?: string;
  has_case?: boolean;
  order_number?: string;
  month?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  per_page?: number;
}): Promise<HistoricalOrdersPage> {
  const query = new URLSearchParams();
  if (params?.source) query.set("source", params.source);
  if (params?.urgency) query.set("urgency", params.urgency);
  if (params?.logistics_operator) query.set("logistics_operator", params.logistics_operator);
  if (params?.city) query.set("city", params.city);
  if (params?.commune) query.set("commune", params.commune);
  if (params?.has_case !== undefined) query.set("has_case", String(params.has_case));
  if (params?.order_number) query.set("order_number", params.order_number);
  if (params?.month) query.set("month", params.month);
  if (params?.date_from) query.set("date_from", params.date_from);
  if (params?.date_to) query.set("date_to", params.date_to);
  if (params?.page) query.set("page", String(params.page));
  if (params?.per_page) query.set("per_page", String(params.per_page));
  return apiFetch<HistoricalOrdersPage>(`/api/orders/history?${query}`);
}

export async function getDistinctHistoricalCities(): Promise<string[]> {
  const data = await apiFetch<{ success: boolean; data: string[] }>("/api/orders/history/cities");
  return data.data;
}

export async function getDistinctHistoricalCommunes(city?: string): Promise<string[]> {
  const qs = city ? `?city=${encodeURIComponent(city)}` : "";
  const data = await apiFetch<{ success: boolean; data: string[] }>(`/api/orders/history/communes${qs}`);
  return data.data;
}

export async function getOverdueOrders(): Promise<{ data: Order[]; count: number }> {
  return apiFetch("/api/orders/overdue");
}

export async function getDueTodayOrders(): Promise<{ data: Order[]; count: number }> {
  return apiFetch("/api/orders/due-today");
}

export async function getSyncStatus(): Promise<SyncStatusResponse> {
  return apiFetch("/api/sync/status");
}

export async function triggerSync(source = "all"): Promise<unknown> {
  return apiFetch("/api/sync/run", {
    method: "POST",
    body: JSON.stringify({ source }),
  });
}

export async function updateHistoricalOrderCase(id: string, case_number: string | null, comments: string | null, case_status: string | null): Promise<void> {
  await apiFetch(`/api/orders/history/${id}/case`, {
    method: "PATCH",
    body: JSON.stringify({ case_number: case_number || null, comments: comments || null, case_status: case_status || null }),
  });
}

export async function addOrderCase(orderId: string, data: { case_number?: string | null; case_status?: string | null; comments?: string | null }): Promise<OrderCase> {
  const res = await apiFetch<{ success: boolean; data: OrderCase }>(`/api/orders/history/${orderId}/cases`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function deleteOrderCase(caseId: string): Promise<void> {
  await apiFetch(`/api/orders/history/cases/${caseId}`, { method: "DELETE" });
}

export async function getActiveOrderCases(orderId: string): Promise<OrderCase[]> {
  const res = await apiFetch<{ success: boolean; data: OrderCase[] }>(`/api/orders/${orderId}/cases`);
  return res.data;
}

export async function addActiveOrderCase(orderId: string, data: { case_number?: string | null; case_status?: string | null; comments?: string | null }): Promise<OrderCase> {
  const res = await apiFetch<{ success: boolean; data: OrderCase }>(`/api/orders/${orderId}/cases`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function getActiveOrdersWithCases(): Promise<ActiveOrderWithCases[]> {
  const res = await apiFetch<{ success: boolean; data: ActiveOrderWithCases[] }>("/api/orders/with-cases");
  return res.data;
}

export async function getCESchedule(): Promise<CESchedule> {
  const data = await apiFetch<{ success: boolean; data: CESchedule | null }>("/api/settings/ce-schedule");
  return data.data ?? { value: {}, updated_at: null };
}

export async function saveCESchedule(schedule: Record<string, string>): Promise<Record<string, string>> {
  const resp = await apiFetch<{ success: boolean; data: Record<string, string> }>(
    "/api/settings/ce-schedule",
    { method: "PUT", body: JSON.stringify(schedule) }
  );
  return resp.data ?? {};
}

export async function fetchWeliveryBatch(ids: string[]): Promise<Record<string, { status: string; depot_at: string | null; delivered_at: string | null }>> {
  try {
    const data = await apiFetch<{ success: boolean; data: Record<string, { status: string; depot_at: string | null; delivered_at: string | null }> }>(
      "/api/dashboard/welivery-batch",
      { method: "POST", body: JSON.stringify({ ids }) }
    );
    return data.data;
  } catch {
    return {};
  }
}

export async function getDelaysByDay(params?: { days?: number; month?: string }): Promise<DailyDelays> {
  try {
    const query = new URLSearchParams();
    if (params?.month) {
      query.set("month", params.month);
    } else {
      query.set("days", String(params?.days ?? 30));
    }
    const data = await apiFetch<{ success: boolean; data: DailyDelays }>(`/api/dashboard/delays-by-day?${query}`);
    return data.data;
  } catch {
    return { days: [], total: 0 };
  }
}

export async function getYesterdayDelays(): Promise<YesterdayDelays> {
  try {
    const data = await apiFetch<{ success: boolean; data: YesterdayDelays }>("/api/dashboard/yesterday-delays");
    return data.data;
  } catch {
    return { date: "", archived_delayed: [], archived_delayed_count: 0, active_overdue: [], active_overdue_count: 0, total: 0 };
  }
}

export async function getKpiMetrics(): Promise<KpiMetrics> {
  try {
    const data = await apiFetch<{ success: boolean; data: KpiMetrics }>("/api/dashboard/metrics/kpi");
    return data.data;
  } catch {
    return { monthly: [], weekly: [], monthly_detail: [], weekly_detail: [] };
  }
}

// ── Products ─────────────────────────────────────────────────────────────────

export async function getProducts(params?: { page?: number; per_page?: number }): Promise<ProductsPage> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.per_page) query.set("per_page", String(params.per_page));
  return apiFetch<ProductsPage>(`/api/products?${query}`);
}

export async function createProduct(data: Omit<Product, "id" | "created_at" | "updated_at">): Promise<Product> {
  const res = await apiFetch<{ success: boolean; data: Product }>("/api/products", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function updateProduct(id: string, data: Partial<Omit<Product, "id" | "created_at" | "updated_at">>): Promise<Product> {
  const res = await apiFetch<{ success: boolean; data: Product }>(`/api/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function deleteProduct(id: string): Promise<void> {
  await apiFetch(`/api/products/${id}`, { method: "DELETE" });
}

export async function syncShopifyProducts(): Promise<{ inserted: number; updated: number; stores: { store: string; variants: number }[] }> {
  const res = await apiFetch<{ success: boolean; inserted: number; updated: number; stores: { store: string; variants: number }[] }>("/api/products/sync-shopify", { method: "POST" });
  return res;
}

export async function exportProducts(): Promise<Blob> {
  const res = await fetch(`${API_URL}/api/products/export`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.blob();
}

export async function importProducts(file: File): Promise<{ inserted: number; updated: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/products/import`, { method: "POST", body: form });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`API error ${res.status}: ${error}`);
  }
  return res.json();
}

// ── Couriers ──────────────────────────────────────────────────────────────────

export async function getCouriers(): Promise<Courier[]> {
  const res = await apiFetch<{ success: boolean; data: Courier[] }>("/api/couriers");
  return res.data;
}

export async function createCourier(data: Omit<Courier, "id" | "created_at" | "updated_at">): Promise<Courier> {
  const res = await apiFetch<{ success: boolean; data: Courier }>("/api/couriers", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function updateCourier(id: string, data: Partial<Omit<Courier, "id" | "created_at" | "updated_at">>): Promise<Courier> {
  const res = await apiFetch<{ success: boolean; data: Courier }>(`/api/couriers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function deleteCourier(id: string): Promise<void> {
  await apiFetch(`/api/couriers/${id}`, { method: "DELETE" });
}

// ─────────────────────────────────────────────────────────────────────────────

export async function getDelayMetrics(): Promise<HistoricalMetrics> {
  try {
    const data = await apiFetch<{ success: boolean; data: unknown }>("/api/dashboard/metrics/delays");
    const raw = data.data as HistoricalMetrics;
    // Guard against old API format (array) or missing fields
    if (!raw || Array.isArray(raw)) return { delayed: [], on_time: [], delayed_weekly: [], on_time_weekly: [] };
    return { delayed: raw.delayed ?? [], on_time: raw.on_time ?? [], delayed_weekly: raw.delayed_weekly ?? [], on_time_weekly: raw.on_time_weekly ?? [] };
  } catch {
    return { delayed: [], on_time: [], delayed_weekly: [], on_time_weekly: [] };
  }
}
