import { Suspense } from "react";
import { getDashboardSummary, getDelayMetrics, getDistinctCities, getDistinctHistoricalCities, getHistoricalOrders, getOrders, getSyncStatus } from "@/app/lib/api";
import { SummaryCards } from "@/app/components/dashboard/SummaryCards";
import { OrdersTable } from "@/app/components/dashboard/OrdersTable";
import { SyncStatus } from "@/app/components/dashboard/SyncStatus";
import { FilterBar } from "@/app/components/dashboard/FilterBar";
import { HistoricalFilterBar } from "@/app/components/dashboard/HistoricalFilterBar";
import { HistoricalOrdersTable } from "@/app/components/dashboard/HistoricalOrdersTable";
import { DelayMetricsTable } from "@/app/components/dashboard/DelayMetricsTable";

interface PageProps {
  searchParams: Promise<{
    // Pedidos activos filters
    source?: string;
    urgency?: string;
    status?: string;
    product_name?: string;
    logistics_operator?: string;
    city?: string;
    commune?: string;
    page?: string;
    // Pedidos históricos filters (h_ prefix)
    h_source?: string;
    h_urgency?: string;
    h_logistics_operator?: string;
    h_city?: string;
    h_commune?: string;
    h_page?: string;
    // Tab
    tab?: string;
  }>;
}

export const revalidate = 0;

function buildUrl(base: Record<string, string | undefined>, overrides: Record<string, string>): string {
  const q = new URLSearchParams();
  const merged = { ...base, ...overrides };
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== "") q.set(k, v);
  }
  return `/dashboard?${q.toString()}`;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tab = params.tab === "historial" ? "historial"
    : params.tab === "estadisticas" ? "estadisticas"
    : "pedidos";

  const syncStatus = await getSyncStatus();

  const activeFilters = {
    source: params.source,
    urgency: params.urgency || undefined,
    status: params.status,
    product_name: params.product_name,
    logistics_operator: params.logistics_operator,
    city: params.city,
    commune: params.commune,
  };

  let summary = null, ordersPage = null, cities: string[] = [];
  let historicalPage = null, historicalCities: string[] = [];
  let delayMetrics = null;

  if (tab === "pedidos") {
    const page = Number(params.page || 1);
    [summary, ordersPage, cities] = await Promise.all([
      getDashboardSummary(activeFilters),
      getOrders({ ...activeFilters, page, per_page: 25 }),
      getDistinctCities(),
    ]);
  } else if (tab === "historial") {
    const hPage = Number(params.h_page || 1);
    [historicalPage, historicalCities] = await Promise.all([
      getHistoricalOrders({
        source: params.h_source,
        urgency: params.h_urgency,
        logistics_operator: params.h_logistics_operator,
        city: params.h_city,
        commune: params.h_commune,
        page: hPage,
        per_page: 25,
      }),
      getDistinctHistoricalCities(),
    ]);
  } else {
    delayMetrics = await getDelayMetrics();
  }

  const page = Number(params.page || 1);
  const hPage = Number(params.h_page || 1);

  // Shared params for buildUrl (preserves both tabs' filters)
  const allParams = {
    source: params.source,
    urgency: params.urgency,
    status: params.status,
    product_name: params.product_name,
    logistics_operator: params.logistics_operator,
    city: params.city,
    commune: params.commune,
    h_source: params.h_source,
    h_urgency: params.h_urgency,
    h_logistics_operator: params.h_logistics_operator,
    h_city: params.h_city,
    h_commune: params.h_commune,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Verken Orders</h1>
            <p className="text-xs text-gray-500">Panel de pedidos</p>
          </div>
          <SyncStatus lastSync={syncStatus.last_sync} />
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-1 -mb-px">
          <a
            href={buildUrl(allParams, { tab: "pedidos" })}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "pedidos"
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Pedidos activos
          </a>
          <a
            href={buildUrl(allParams, { tab: "historial" })}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "historial"
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Pedidos históricos
          </a>
          <a
            href={buildUrl(allParams, { tab: "estadisticas" })}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "estadisticas"
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Estadísticas
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ── Pedidos activos ── */}
        {tab === "pedidos" && summary && ordersPage && (
          <>
            <SummaryCards summary={summary} />

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-base font-medium text-gray-900">
                  Pedidos ({ordersPage.total})
                </h2>
                <Suspense fallback={null}>
                  <FilterBar cities={cities} />
                </Suspense>
              </div>

              <div className="px-6 py-4">
                <OrdersTable orders={ordersPage.data} />
              </div>

              {ordersPage.pages > 1 && (
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                  <span>Página {ordersPage.page} de {ordersPage.pages}</span>
                  <div className="flex gap-2">
                    {ordersPage.page > 1 && (
                      <a
                        href={buildUrl(allParams, { tab: "pedidos", page: String(page - 1) })}
                        className="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        Anterior
                      </a>
                    )}
                    {ordersPage.page < ordersPage.pages && (
                      <a
                        href={buildUrl(allParams, { tab: "pedidos", page: String(page + 1) })}
                        className="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        Siguiente
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Pedidos históricos ── */}
        {tab === "historial" && historicalPage && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-base font-medium text-gray-900">
                Pedidos históricos ({historicalPage.total})
              </h2>
              <Suspense fallback={null}>
                <HistoricalFilterBar cities={historicalCities} />
              </Suspense>
            </div>

            <div className="px-6 py-4">
              <HistoricalOrdersTable orders={historicalPage.data} />
            </div>

            {historicalPage.pages > 1 && (
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                <span>Página {historicalPage.page} de {historicalPage.pages}</span>
                <div className="flex gap-2">
                  {historicalPage.page > 1 && (
                    <a
                      href={buildUrl(allParams, { tab: "historial", h_page: String(hPage - 1) })}
                      className="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      Anterior
                    </a>
                  )}
                  {historicalPage.page < historicalPage.pages && (
                    <a
                      href={buildUrl(allParams, { tab: "historial", h_page: String(hPage + 1) })}
                      className="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      Siguiente
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Estadísticas ── */}
        {tab === "estadisticas" && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-medium text-gray-900">Estadísticas de entregas</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Pedidos resueltos agrupados por mes, marketplace y operador logístico
              </p>
            </div>
            <div className="px-6 py-6">
              <DelayMetricsTable metrics={delayMetrics ?? { delayed: [], on_time: [] }} />
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
