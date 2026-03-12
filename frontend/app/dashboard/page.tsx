import { Suspense } from "react";
import { getActiveOrdersWithCases, getCESchedule, getCouriers, getDashboardSummary, getDelayMetrics, getDelaysByDay, getDistinctCities, getDistinctHistoricalCities, getHistoricalOrders, getKpiMetrics, getOrders, getProducts, getSyncStatus } from "@/app/lib/api";
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
import { DailyDelaysSummary } from "@/app/components/dashboard/DailyDelaysSummary";
import { CEScheduleModal } from "@/app/components/dashboard/CEScheduleModal";
import { ProductsTable } from "@/app/components/dashboard/ProductsTable";
import { CouriersTable } from "@/app/components/dashboard/CouriersTable";
import type { Courier, ProductsPage } from "@/app/types";

interface PageProps {
  searchParams: Promise<{
    // Pedidos activos / en tránsito filters
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
    // Atrasados month filter
    a_month?: string;
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

// ── Icons ────────────────────────────────────────────────────────────────────

function IconClock() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconBox() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function IconTruck() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

function IconCheckCircle() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

// Top-nav icons
function IconShoppingBag() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function IconCalculator() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="8" y1="6" x2="16" y2="6" />
      <line x1="8" y1="10" x2="8" y2="10" strokeWidth="3" strokeLinecap="round" />
      <line x1="12" y1="10" x2="12" y2="10" strokeWidth="3" strokeLinecap="round" />
      <line x1="16" y1="10" x2="16" y2="10" strokeWidth="3" strokeLinecap="round" />
      <line x1="8" y1="14" x2="8" y2="14" strokeWidth="3" strokeLinecap="round" />
      <line x1="12" y1="14" x2="12" y2="14" strokeWidth="3" strokeLinecap="round" />
      <line x1="16" y1="14" x2="16" y2="14" strokeWidth="3" strokeLinecap="round" />
      <line x1="8" y1="18" x2="8" y2="18" strokeWidth="3" strokeLinecap="round" />
      <line x1="12" y1="18" x2="12" y2="18" strokeWidth="3" strokeLinecap="round" />
      <line x1="16" y1="18" x2="16" y2="18" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function IconTag() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" strokeWidth="3" />
    </svg>
  );
}

function IconNavTruck() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

function IconTicket() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" />
    </svg>
  );
}

function IconBarChart() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tab = params.tab === "pedidos" ? "pedidos"
    : params.tab === "transito" ? "transito"
    : params.tab === "historial" ? "historial"
    : params.tab === "estadisticas" ? "estadisticas"
    : params.tab === "tickets" ? "tickets"
    : params.tab === "cotizador" ? "cotizador"
    : params.tab === "productos" ? "productos"
    : params.tab === "couriers" ? "couriers"
    : params.tab === "configuracion" ? "configuracion"
    : "atrasados";

  const isPedidosGroup = tab === "atrasados" || tab === "pedidos" || tab === "transito" || tab === "historial";

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
  let historicalPage = null, historicalCities: string[] = [], historicalDelayedCount = 0;
  let ticketsPage = null;
  let activeWithCases = null;
  let delayMetrics = null;
  let kpiMetrics = null;
  let dailyDelays = null;
  let productsPage: ProductsPage | null = null;
  let couriersData: Courier[] = [];

  if (tab === "pedidos") {
    const page = Number(params.page || 1);
    [summary, ordersPage, cities] = await Promise.all([
      getDashboardSummary({ ...activeFilters, perspective: "bodega" }),
      getOrders({ ...activeFilters, page, per_page: 25, perspective: "bodega" }),
      getDistinctCities(),
    ]);
  } else if (tab === "transito") {
    const page = Number(params.page || 1);
    [summary, ordersPage, cities] = await Promise.all([
      getDashboardSummary({ ...activeFilters, status: "shipped", perspective: "cliente" }),
      getOrders({ ...activeFilters, status: "shipped", page, per_page: 25, perspective: "cliente" }),
      getDistinctCities(),
    ]);
  } else if (tab === "historial") {
    const hPage = Number(params.h_page || 1);
    const hFilters = {
      source: params.h_source,
      logistics_operator: params.h_logistics_operator,
      city: params.h_city,
      commune: params.h_commune,
      order_number: params.h_order_number,
      date_from: params.h_date_from,
      date_to: params.h_date_to,
    };
    if (!params.h_urgency) {
      // Fetch page + delayed count in parallel
      const [hp, hc, overdueResult] = await Promise.all([
        getHistoricalOrders({ ...hFilters, page: hPage, per_page: 25 }),
        getDistinctHistoricalCities(),
        getHistoricalOrders({ ...hFilters, urgency: "overdue", per_page: 1 }),
      ]);
      historicalPage = hp;
      historicalCities = hc;
      historicalDelayedCount = overdueResult.total;
    } else {
      [historicalPage, historicalCities] = await Promise.all([
        getHistoricalOrders({ ...hFilters, urgency: params.h_urgency, page: hPage, per_page: 25 }),
        getDistinctHistoricalCities(),
      ]);
      historicalDelayedCount = params.h_urgency === "overdue" ? historicalPage.total : 0;
    }
  } else if (tab === "atrasados") {
    const aMonth = params.a_month || undefined;
    dailyDelays = await getDelaysByDay(aMonth ? { month: aMonth } : { days: 30 });
  } else if (tab === "tickets") {
    [ticketsPage, activeWithCases] = await Promise.all([
      getHistoricalOrders({ has_case: true, per_page: 100 }),
      getActiveOrdersWithCases(),
    ]);
  } else if (tab === "productos") {
    productsPage = await getProducts({ per_page: 200 });
  } else if (tab === "couriers") {
    couriersData = await getCouriers();
  } else if (tab === "configuracion") {
    // no extra data needed
  } else if (tab === "estadisticas") {
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
    a_month: params.a_month,
  };

  const topNavClass = (active: boolean) =>
    `flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
      active
        ? "border-gray-900 text-gray-900"
        : "border-transparent text-gray-500 hover:text-gray-700"
    }`;

  const subNavClass = (active: boolean) =>
    `flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      active
        ? "border-gray-900 text-gray-900"
        : "border-transparent text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div className="min-h-screen bg-gray-50">
      {showModal && <CEScheduleModal initialSchedule={ceSchedule} />}
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <a href="/dashboard" className="block">
            <h1 className="text-xl font-semibold text-gray-900 hover:text-gray-600 transition-colors">Verken Orders</h1>
            <p className="text-xs text-gray-500">Panel de pedidos</p>
          </a>
          <SyncStatus lastSync={syncStatus.last_sync} />
        </div>

        {/* Top-level Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-1 -mb-px">
          <a href={buildUrl(allParams, { tab: "atrasados" })} className={topNavClass(isPedidosGroup)}>
            <IconShoppingBag />
            Pedidos
          </a>
          <a href={buildUrl(allParams, { tab: "cotizador" })} className={topNavClass(tab === "cotizador")}>
            <IconCalculator />
            Cotizador
          </a>
          <a href={buildUrl(allParams, { tab: "productos" })} className={topNavClass(tab === "productos")}>
            <IconTag />
            Productos
          </a>
          <a href={buildUrl(allParams, { tab: "couriers" })} className={topNavClass(tab === "couriers")}>
            <IconNavTruck />
            Couriers
          </a>
          <a href={buildUrl(allParams, { tab: "tickets" })} className={topNavClass(tab === "tickets")}>
            <IconTicket />
            Tickets
          </a>
          <a href={buildUrl(allParams, { tab: "estadisticas" })} className={topNavClass(tab === "estadisticas")}>
            <IconBarChart />
            Estadísticas
          </a>
          <a href={buildUrl(allParams, { tab: "configuracion" })} className={topNavClass(tab === "configuracion")}>
            <IconSettings />
            Configuración
          </a>
        </div>

        {/* Pedidos sub-tabs */}
        {isPedidosGroup && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-1 bg-gray-50 border-t border-gray-100 -mb-px">
            <a
              href={buildUrl(allParams, { tab: "atrasados" })}
              className={subNavClass(tab === "atrasados")}
            >
              <IconClock />
              Atrasados
            </a>
            <a
              href={buildUrl(allParams, { tab: "pedidos" })}
              className={subNavClass(tab === "pedidos")}
            >
              <IconBox />
              En Bodega
            </a>
            <a
              href={buildUrl(allParams, { tab: "transito" })}
              className={subNavClass(tab === "transito")}
            >
              <IconTruck />
              En Tránsito
            </a>
            <a
              href={buildUrl(allParams, { tab: "historial" })}
              className={subNavClass(tab === "historial")}
            >
              <IconCheckCircle />
              Entregados
            </a>
          </div>
        )}

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

        {/* ── En Bodega ── */}
        {tab === "pedidos" && summary && ordersPage && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-base font-medium text-gray-900">
                  En Bodega ({ordersPage.total})
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Pedidos pendientes de entrega al transportista
                </p>
              </div>
              <Suspense fallback={null}>
                <FilterBar cities={cities} />
              </Suspense>
            </div>

            <div className="px-6 py-4">
              <SummaryCards summary={summary} perspective="bodega" />
            </div>

            <div className="px-6 py-4 border-t border-gray-100">
              <OrdersTable orders={ordersPage.data} orderIdsWithCases={ordersPage.order_ids_with_cases} perspective="bodega" />
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
        )}

        {/* ── En Tránsito ── */}
        {tab === "transito" && summary && ordersPage && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-base font-medium text-gray-900">
                  En Tránsito ({ordersPage.total})
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Pedidos despachados en camino al cliente final
                </p>
              </div>
              <Suspense fallback={null}>
                <FilterBar cities={cities} />
              </Suspense>
            </div>

            <div className="px-6 py-4">
              <SummaryCards summary={summary} perspective="cliente" />
            </div>

            <div className="px-6 py-4 border-t border-gray-100">
              <OrdersTable orders={ordersPage.data} orderIdsWithCases={ordersPage.order_ids_with_cases} perspective="cliente" />
            </div>

            {ordersPage.pages > 1 && (
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                <span>Página {ordersPage.page} de {ordersPage.pages}</span>
                <div className="flex gap-2">
                  {ordersPage.page > 1 && (
                    <a
                      href={buildUrl(allParams, { tab: "transito", page: String(page - 1) })}
                      className="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      Anterior
                    </a>
                  )}
                  {ordersPage.page < ordersPage.pages && (
                    <a
                      href={buildUrl(allParams, { tab: "transito", page: String(page + 1) })}
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

        {/* ── Atrasados ── */}
        {tab === "atrasados" && dailyDelays && (
          <DailyDelaysSummary data={dailyDelays} currentMonth={params.a_month} />
        )}

        {/* ── Entregados (historial) ── */}
        {tab === "historial" && historicalPage && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-base font-medium text-gray-900">
                  Entregados ({historicalPage.total})
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Pedidos resueltos · el estado refleja el último registrado al salir del feed activo
                </p>
              </div>
              <Suspense fallback={null}>
                <HistoricalFilterBar cities={historicalCities} />
              </Suspense>
            </div>

            {/* Summary cards */}
            <div className="px-6 py-4 border-b border-gray-100 grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-gray-50 px-4 py-3 text-center">
                <div className="text-2xl font-semibold text-gray-900">{historicalPage.total}</div>
                <div className="text-xs text-gray-500 mt-0.5">Total resueltos</div>
              </div>
              <div className="rounded-lg bg-red-50 px-4 py-3 text-center">
                <div className="text-2xl font-semibold text-red-600">{historicalDelayedCount}</div>
                <div className="text-xs text-red-500 mt-0.5">Atrasados</div>
              </div>
              <div className="rounded-lg bg-green-50 px-4 py-3 text-center">
                <div className="text-2xl font-semibold text-green-600">{historicalPage.total - historicalDelayedCount}</div>
                <div className="text-xs text-green-500 mt-0.5">A tiempo</div>
              </div>
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

        {/* ── Productos ── */}
        {tab === "productos" && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-medium text-gray-900">Productos</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Catálogo de productos con dimensiones y peso para cotización
              </p>
            </div>
            <div className="px-6 py-6">
              <ProductsTable
                initialData={productsPage ?? { data: [], total: 0, page: 1, per_page: 200, pages: 1 }}
              />
            </div>
          </div>
        )}

        {/* ── Couriers ── */}
        {tab === "couriers" && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-medium text-gray-900">Couriers</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Couriers disponibles, tarifas y restricciones de envío
              </p>
            </div>
            <div className="px-6 py-6">
              <CouriersTable initialData={couriersData} />
            </div>
          </div>
        )}

        {/* ── Cotizador ── */}
        {tab === "cotizador" && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-medium text-gray-900">Cotizador</h2>
              <p className="text-xs text-gray-500 mt-0.5">Próximamente</p>
            </div>
            <div className="px-6 py-16 flex items-center justify-center text-gray-400 text-sm">
              En construcción
            </div>
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
                <KpiTable metrics={kpiMetrics ?? { monthly: [], weekly: [], monthly_detail: [], weekly_detail: [] }} />
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
                <DelayMetricsTable metrics={delayMetrics ?? { delayed: [], on_time: [], delayed_weekly: [], on_time_weekly: [] }} />
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  );
}
