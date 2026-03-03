import { Suspense } from "react";
import { getDashboardSummary, getDelayMetrics, getOrders, getSyncStatus } from "@/app/lib/api";
import { SummaryCards } from "@/app/components/dashboard/SummaryCards";
import { OrdersTable } from "@/app/components/dashboard/OrdersTable";
import { SyncStatus } from "@/app/components/dashboard/SyncStatus";
import { FilterBar } from "@/app/components/dashboard/FilterBar";
import { DelayMetricsTable } from "@/app/components/dashboard/DelayMetricsTable";

interface PageProps {
  searchParams: Promise<{
    source?: string;
    urgency?: string;
    status?: string;
    page?: string;
    tab?: string;
  }>;
}

export const revalidate = 0;

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page || 1);
  const tab = params.tab === "historial" ? "historial" : "pedidos";

  const [summary, ordersPage, syncStatus, delayMetrics] = await Promise.all([
    getDashboardSummary(),
    getOrders({
      source: params.source,
      urgency: params.urgency,
      status: params.status,
      page,
      per_page: 25,
    }),
    getSyncStatus(),
    getDelayMetrics(),
  ]);

  const tabBase = { source: params.source, urgency: params.urgency, status: params.status };

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
            href={`/dashboard?${new URLSearchParams({ ...tabBase, tab: "pedidos" })}`}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "pedidos"
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Pedidos activos
          </a>
          <a
            href={`/dashboard?${new URLSearchParams({ tab: "historial" })}`}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "historial"
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Histórico de atrasos
            {delayMetrics.length > 0 && (
              <span className="ml-1.5 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                {delayMetrics.reduce((sum, m) => sum + m.count, 0)}
              </span>
            )}
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {tab === "pedidos" && (
          <>
            <SummaryCards summary={summary} />

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-base font-medium text-gray-900">
                  Pedidos ({ordersPage.total})
                </h2>
                <Suspense fallback={null}>
                  <FilterBar />
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
                        href={`/dashboard?${new URLSearchParams({ ...params, page: String(page - 1) })}`}
                        className="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        Anterior
                      </a>
                    )}
                    {ordersPage.page < ordersPage.pages && (
                      <a
                        href={`/dashboard?${new URLSearchParams({ ...params, page: String(page + 1) })}`}
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

        {tab === "historial" && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-medium text-gray-900">Histórico de atrasos</h2>
              <p className="text-xs text-gray-500 mt-0.5">Pedidos entregados después de la fecha límite</p>
            </div>
            <div className="px-6 py-4">
              <DelayMetricsTable metrics={delayMetrics} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
