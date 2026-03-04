import { DashboardSummary, HistoricalMetrics, Order, OrdersPage, SyncStatusResponse } from "@/app/types";

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

export async function getDelayMetrics(): Promise<HistoricalMetrics> {
  try {
    const data = await apiFetch<{ success: boolean; data: unknown }>("/api/dashboard/metrics/delays");
    const raw = data.data as HistoricalMetrics;
    // Guard against old API format (array) or missing fields
    if (!raw || Array.isArray(raw)) return { delayed: [], on_time: [] };
    return { delayed: raw.delayed ?? [], on_time: raw.on_time ?? [] };
  } catch {
    return { delayed: [], on_time: [] };
  }
}
