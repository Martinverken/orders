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

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const data = await apiFetch<{ success: boolean; data: DashboardSummary }>("/api/dashboard/summary");
  return data.data;
}

export async function getOrders(params?: {
  source?: string;
  status?: string;
  urgency?: string;
  page?: number;
  per_page?: number;
}): Promise<OrdersPage> {
  const query = new URLSearchParams();
  if (params?.source) query.set("source", params.source);
  if (params?.status) query.set("status", params.status);
  if (params?.urgency) query.set("urgency", params.urgency);
  if (params?.page) query.set("page", String(params.page));
  if (params?.per_page) query.set("per_page", String(params.per_page));
  return apiFetch<OrdersPage>(`/api/orders?${query}`);
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
