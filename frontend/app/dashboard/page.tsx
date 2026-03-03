import { Suspense } from "react";
import { getDashboardSummary, getOrders, getSyncStatus } from "@/app/lib/api";
import { SummaryCards } from "@/app/components/dashboard/SummaryCards";
import { OrdersTable } from "@/app/components/dashboard/OrdersTable";
import { SyncStatus } from "@/app/components/dashboard/SyncStatus";
import { FilterBar } from "@/app/components/dashboard/FilterBar";

interface PageProps {
  searchParams: Promise<{
    source?: string;
    urgency?: string;
    status?: string;
    page?: string;
  }>;
}

export const revalidate = 0; // Always fresh from server

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page || 1);

  const [summary, ordersPage, syncStatus] = await Promise.all([
    getDashboardSummary(),
    getOrders({
      source: params.source,
      urgency: params.urgency,
      status: params.status,
      page,
      per_page: 25,
    }),
    getSyncStatus(),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Verken Orders</h1>
            <p className="text-xs text-gray-500">Panel de pedidos pendientes</p>
          </div>
          <SyncStatus lastSync={syncStatus.last_sync} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Summary Cards */}
        <SummaryCards summary={summary} />

        {/* Orders Table Card */}
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

          {/* Pagination */}
          {ordersPage.pages > 1 && (
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
              <span>
                Página {ordersPage.page} de {ordersPage.pages}
              </span>
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
      </main>
    </div>
  );
}
