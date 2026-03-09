import { Suspense } from "react";
import { getActiveOrdersWithCases, getCESchedule, getDashboardSummary, getDelayMetrics, getDistinctCities, getDistinctHistoricalCities, getHistoricalOrders, getKpiMetrics, getOrders, getSyncStatus } from "@/app/lib/api";
import { SummaryCards } from "@/app/components/dashboard/SummaryCards";
import { OrdersTable } from "@/app/components/dashboard/OrdersTable";
import { SyncStatus } from "@/app/components/dashboard/SyncStatus";
import { FilterBar } from "@/app/components/dashboard/FilterBar";
import { HistoricalFilterBar } from "@/app/components/dashboard/HistoricalFilterBar";
import { HistoricalOrdersTable } from "@/app/components/dashboard/HistoricalOrdersTable";
import { TicketsTable } from "@/app/components/dashboard/TicketsTable";
import { DelayMetricsTable } from "@/app/components/dashboard/DelayMetricsTable";
import { KpiTable } from "@/app/components/dashboard/KpiTable";
import { CEScheduleSettings } from "@/app/components/dashboard/CEScheduleSettings";
import { CEScheduleModal } from "@/app/components/dashboard/CEScheduleModal";

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
    order_number?: string;
    page?: string;
    // Pedidos históricos filters (h_ prefix)
    h_source?: string;
    h_urgency?: string;
    h_logistics_operator?: string;
    h_city?: string;
    h_commune?: string;
    h_order_number?: string;
    h_date_from?: string;
    h_date_to?: string;
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
    : params.tab === "tickets" ? "tickets"
    : params.tab === "configuracion" ? "configuracion"
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
    order_number: params.order_number,
  };

  // Always fetch CE schedule (needed for Friday modal on any tab)
  const ceSchedule = await getCESchedule();

  // Friday modal: show if today is Friday and schedule wasn't updated this week
  const nowSantiago = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Santiago" }));
  const isFriday = nowSantiago.getDay() === 5;
  const startOfWeek = new Date(nowSantiago);
  startOfWeek.setDate(nowSantiago.getDate() - nowSantiago.getDay() + 1); // Monday
  startOfWeek.setHours(0, 0, 0, 0);
  const scheduleUpdatedAt = ceSchedule.updated_at ? new Date(ceSchedule.updated_at) : null;
  const showModal = isFriday && (!scheduleUpdatedAt || scheduleUpdatedAt < startOfWeek);

  // CE schedule warning: Friday + next week not fully configured
  const nextWeekDates = isFriday
    ? (() => {
        const nextMonday = new Date(nowSantiago);
        nextMonday.setDate(nowSantiago.getDate() - nowSantiago.getDay() + 8);
        nextMonday.setHours(0, 0, 0, 0);
        return Array.from({ length: 5 }, (_, i) => {
          const d = new Date(nextMonday);
          d.setDate(nextMonday.getDate() + i);
          return d.toLocaleDateString("sv");
        });
      })()
    : [];
  const showCEWarning = isFriday && nextWeekDates.some((iso) => !ceSchedule.value?.[iso]);

  let summary = null, ordersPage = null, cities: string[] = [];
  let historicalPage = null, historicalCities: string[] = [];
  let ticketsPage = null;
  let activeWithCases = null;
  let delayMetrics = null;
  let kpiMetrics = null;

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
        order_number: params.h_order_number,
        date_from: params.h_date_from,
        date_to: params.h_date_to,
        page: hPage,
        per_page: 25,
      }),
      getDistinctHistoricalCities(),
    ]);
  } else if (tab === "tickets") {
    [ticketsPage, activeWithCases] = await Promise.all([
      getHistoricalOrders({ has_case: true, per_page: 100 }),
      getActiveOrdersWithCases(),
    ]);
  } else if (tab === "configuracion") {
    // no extra data needed
  } else {
    [delayMetrics, kpiMetrics] = await Promise.all([
      getDelayMetrics(),
      getKpiMetrics(),
    ]);
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
    order_number: params.order_number,
    h_source: params.h_source,
    h_urgency: params.h_urgency,
    h_logistics_operator: params.h_logistics_operator,
    h_city: params.h_city,
    h_commune: params.h_commune,
    h_order_number: params.h_order_number,
    h_date_from: params.h_date_from,
    h_date_to: params.h_date_to,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {showModal && <CEScheduleModal initialSchedule={ceSchedule} />}
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
            href={buildUrl(allParams, { tab: "tickets" })}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "tickets"
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Tickets
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
          <a
            href={buildUrl(allParams, { tab: "configuracion" })}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "configuracion"
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Configuración
          </a>
        </div>

        {showCEWarning && (
          <div className="bg-amber-50 border-t border-amber-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-2">
              <span className="text-amber-700 font-bold text-sm">⚠️ IMPORTANTE:</span>
              <span className="text-amber-800 text-sm">
                Debes ir a{" "}
                <a
                  href={buildUrl(allParams, { tab: "configuracion" })}
                  className="font-semibold underline hover:text-amber-900"
                >
                  Configuración
                </a>{" "}
                y agregar los horarios del Centro de Envíos de la próxima semana.
              </span>
            </div>
          </div>
        )}
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
                <OrdersTable orders={ordersPage.data} orderIdsWithCases={ordersPage.order_ids_with_cases} />
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

        {/* ── Tickets ── */}
        {tab === "tickets" && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-medium text-gray-900">
                Tickets ({(ticketsPage?.total ?? 0) + (activeWithCases?.length ?? 0)})
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">Pedidos con gestión activa</p>
            </div>
            <div className="px-6 py-4">
              <TicketsTable orders={ticketsPage?.data ?? []} activeOrders={activeWithCases ?? []} />
            </div>
          </div>
        )}

        {/* ── Configuración ── */}
        {tab === "configuracion" && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-medium text-gray-900">Horarios Centro de Envíos (ML)</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Actualiza cada viernes con el horario de la próxima semana
              </p>
            </div>
            <div className="px-6 py-6">
              <CEScheduleSettings initialSchedule={ceSchedule} />
            </div>
          </div>
        )}

        {/* ── Estadísticas ── */}
        {tab === "estadisticas" && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-medium text-gray-900">KPI Operaciones — % Atraso</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Porcentaje de pedidos atrasados sobre el total, agrupado por mes y semana
                </p>
              </div>
              <div className="px-6 py-6">
                <KpiTable metrics={kpiMetrics ?? { monthly: [], weekly: [] }} />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-medium text-gray-900">Detalle por marketplace y operador</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Pedidos resueltos agrupados por mes, marketplace y operador logístico
                </p>
              </div>
              <div className="px-6 py-6">
                <DelayMetricsTable metrics={delayMetrics ?? { delayed: [], on_time: [] }} />
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  );
}
