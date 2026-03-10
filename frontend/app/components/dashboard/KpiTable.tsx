"use client";

import { useState } from "react";
import { HistoricalOrder, KpiMetrics, KpiPeriod, KpiDetailPeriod, OrderCase } from "@/app/types";
import { getHistoricalOrders, addOrderCase } from "@/app/lib/api";
import { SOURCE_LABEL, formatDeadline, getCreatedAt, getOrderNumber, getProductDetails, getShippingDestination, getShippingMethod, getOperator, getTrackingCode, getTrackingUrl } from "@/app/lib/utils";
import { CaseHistoryModal } from "./CaseHistoryModal";

interface Props {
  metrics: KpiMetrics;
}

function formatMonth(period: string): string {
  const [year, m] = period.split("-");
  const date = new Date(Number(year), Number(m) - 1);
  return date.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
}

function formatWeek(period: string): string {
  const monday = new Date(period + "T00:00:00");
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

function ComplianceBadge({ pct }: { pct: number }) {
  const cls = pct >= 95
    ? "bg-green-100 text-green-700"
    : "bg-red-100 text-red-700";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {pct}%
    </span>
  );
}

function ComplianceBar({ pct }: { pct: number }) {
  const color = pct >= 95 ? "bg-green-500" : "bg-red-500";
  return (
    <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function TicketButton({ orderId, orderLabel, initialCases }: { orderId: string; orderLabel: string; initialCases: OrderCase[] }) {
  const [open, setOpen] = useState(false);
  const [cases, setCases] = useState<OrderCase[]>(initialCases);

  const handleAdd = async (data: { case_number?: string | null; case_status?: string | null; comments?: string | null }) => {
    const created = await addOrderCase(orderId, data);
    setCases((prev) => [...prev, created]);
    return created;
  };

  const topStatus = cases.find((c) => c.case_status === "pending")?.case_status
    ?? cases.find((c) => c.case_status === "created")?.case_status
    ?? cases[0]?.case_status;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-full px-2.5 py-1 hover:bg-gray-50 transition-colors"
      >
        {cases.length > 0 && topStatus && (
          <span className={`inline-block w-2 h-2 rounded-full ${topStatus === "pending" ? "bg-amber-400" : topStatus === "created" ? "bg-blue-400" : "bg-green-400"}`} />
        )}
        <span className="text-gray-600">
          {cases.length > 0 ? `${cases.length} ticket${cases.length > 1 ? "s" : ""}` : "+ Ticket"}
        </span>
      </button>
      {open && (
        <CaseHistoryModal
          orderLabel={orderLabel}
          initialCases={cases}
          onClose={() => setOpen(false)}
          onAddCase={handleAdd}
        />
      )}
    </>
  );
}

function KpiDelayModal({ period, isWeekly, onClose }: { period: string; isWeekly: boolean; onClose: () => void }) {
  const [orders, setOrders] = useState<HistoricalOrder[] | null>(null);
  const [loading, setLoading] = useState(true);

  useState(() => {
    const params: Record<string, unknown> = {
      urgency: "atrasado",
      per_page: 100,
    };
    if (isWeekly) {
      const monday = new Date(period + "T00:00:00");
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      params.date_from = period;
      params.date_to = sunday.toLocaleDateString("sv");
    } else {
      params.month = period;
    }
    getHistoricalOrders(params as Parameters<typeof getHistoricalOrders>[0])
      .then((page) => setOrders(page.data))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  });

  const title = isWeekly
    ? `Pedidos atrasados — ${formatWeek(period)}`
    : `Pedidos atrasados — ${formatMonth(period)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-6xl w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">Todos los marketplaces</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="overflow-auto flex-1 px-6 py-4">
          {loading ? (
            <p className="text-center text-gray-400 py-8">Cargando...</p>
          ) : !orders?.length ? (
            <p className="text-center text-gray-400 py-8">Sin pedidos atrasados</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="pb-3 pr-4 font-medium">Order N°</th>
                  <th className="pb-3 pr-4 font-medium">Marketplace</th>
                  <th className="pb-3 pr-4 font-medium">Producto</th>
                  <th className="pb-3 pr-4 font-medium">Método Envío</th>
                  <th className="pb-3 pr-4 font-medium">Operador</th>
                  <th className="pb-3 pr-4 font-medium">Estado</th>
                  <th className="pb-3 pr-4 font-medium">Fecha Límite</th>
                  <th className="pb-3 pr-4 font-medium">Fecha Entrega</th>
                  <th className="pb-3 pr-4 font-medium">Retraso</th>
                  <th className="pb-3 pr-4 font-medium">Tracking</th>
                  <th className="pb-3 pr-4 font-medium">Ciudad</th>
                  <th className="pb-3 font-medium">Tickets</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const orderNumber = getOrderNumber(order.raw_data, order.external_id);
                  const product = getProductDetails(order.raw_data, null, null);
                  const tracking = getTrackingCode(order.raw_data);
                  const trackingUrl = getTrackingUrl(order.raw_data, tracking);
                  const hrs = Math.round(order.days_delayed * 24);
                  return (
                    <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className={`py-2.5 pr-4 font-mono text-xs ${(order.cases?.length ?? 0) > 0 ? "text-amber-600 font-semibold" : "text-gray-700"}`}>{orderNumber}</td>
                      <td className="py-2.5 pr-4 text-xs">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          order.source === "falabella" ? "bg-orange-100 text-orange-700"
                          : order.source?.startsWith("shopify") ? "bg-green-100 text-green-700"
                          : order.source === "walmart" ? "bg-blue-100 text-blue-700"
                          : order.source === "paris" ? "bg-purple-100 text-purple-700"
                          : "bg-yellow-100 text-yellow-700"
                        }`}>
                          {SOURCE_LABEL[order.source] ?? order.source}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-gray-600 max-w-[140px] truncate">{product.sku || "—"}</td>
                      <td className="py-2.5 pr-4 text-xs text-gray-600">{getShippingMethod(order.source, order.raw_data ?? undefined)}</td>
                      <td className="py-2.5 pr-4 text-xs text-gray-600">{getOperator(order.source, order.raw_data ?? undefined)}</td>
                      <td className="py-2.5 pr-4 text-xs text-gray-600">{order.status || "—"}</td>
                      <td className="py-2.5 pr-4 text-xs text-gray-600 whitespace-nowrap">{formatDeadline(order.limit_delivery_date)}</td>
                      <td className="py-2.5 pr-4 text-xs text-gray-600 whitespace-nowrap">{order.delivered_at ? formatDeadline(order.delivered_at) : "—"}</td>
                      <td className="py-2.5 pr-4 text-xs text-red-600 font-medium whitespace-nowrap">+{hrs} {hrs === 1 ? "hr" : "hrs"}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs">
                        {trackingUrl ? (
                          <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{tracking}</a>
                        ) : (tracking || "—")}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-gray-600 capitalize">{order.raw_data ? getShippingDestination(order.raw_data).city?.toLowerCase() || "—" : "—"}</td>
                      <td className="py-2.5">
                        <TicketButton
                          orderId={order.id}
                          orderLabel={orderNumber}
                          initialCases={order.cases ?? []}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricsTable({
  data,
  formatPeriod,
  isWeekly,
  onClickDelayed,
}: {
  data: KpiPeriod[];
  formatPeriod: (p: string) => string;
  isWeekly: boolean;
  onClickDelayed: (period: string, isWeekly: boolean) => void;
}) {
  const rows = [...data].reverse();

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
          <th className="pb-3 font-medium pr-6">Periodo</th>
          <th className="pb-3 font-medium text-right pr-4">Total</th>
          <th className="pb-3 font-medium text-right pr-4">A tiempo</th>
          <th className="pb-3 font-medium text-right pr-4">Atrasados</th>
          <th className="pb-3 font-medium text-right pr-4">Bodega</th>
          <th className="pb-3 font-medium text-right pr-4">Transportista</th>
          <th className="pb-3 font-medium text-right pr-4">% Cumplim. <span className="text-gray-400 font-normal">(obj. &ge;95%)</span></th>
          <th className="pb-3 font-medium pr-4"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map((row) => (
          <tr key={row.period} className="hover:bg-gray-50">
            <td className="py-3 text-gray-700 whitespace-nowrap pr-6 capitalize">
              {formatPeriod(row.period)}
            </td>
            <td className="py-3 text-right font-medium text-gray-700 pr-4">{row.total}</td>
            <td className="py-3 text-right text-green-700 font-medium pr-4">{row.total - row.delayed}</td>
            <td className="py-3 text-right pr-4">
              {row.delayed > 0 ? (
                <button
                  onClick={() => onClickDelayed(row.period, isWeekly)}
                  className="text-red-600 font-medium hover:underline cursor-pointer"
                >
                  {row.delayed}
                </button>
              ) : (
                <span className="text-gray-400">0</span>
              )}
            </td>
            <td className="py-3 text-right pr-4">
              {row.bodega > 0 ? (
                <span className="text-orange-600 font-medium">{row.bodega}</span>
              ) : (
                <span className="text-gray-400">0</span>
              )}
            </td>
            <td className="py-3 text-right pr-4">
              {row.transportista > 0 ? (
                <span className="text-purple-600 font-medium">{row.transportista}</span>
              ) : (
                <span className="text-gray-400">0</span>
              )}
            </td>
            <td className="py-3 text-right pr-4">
              <ComplianceBadge pct={100 - row.pct_delayed} />
            </td>
            <td className="py-3 pr-4">
              <ComplianceBar pct={100 - row.pct_delayed} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const SOURCE_COLOR: Record<string, string> = {
  falabella: "bg-orange-100 text-orange-700",
  mercadolibre: "bg-yellow-100 text-yellow-700",
  walmart: "bg-blue-100 text-blue-700",
  paris: "bg-purple-100 text-purple-700",
  shopify_verken: "bg-green-100 text-green-700",
  shopify_kaut: "bg-green-100 text-green-700",
};

function DetailMetricsTable({
  data,
  formatPeriod,
  isWeekly,
  onClickDelayed,
}: {
  data: KpiDetailPeriod[];
  formatPeriod: (p: string) => string;
  isWeekly: boolean;
  onClickDelayed: (period: string, isWeekly: boolean) => void;
}) {
  const rows = [...data].reverse();

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
          <th className="pb-3 font-medium pr-4">Periodo</th>
          <th className="pb-3 font-medium pr-4">Fuente</th>
          <th className="pb-3 font-medium pr-4">Método</th>
          <th className="pb-3 font-medium text-right pr-4">Total</th>
          <th className="pb-3 font-medium text-right pr-4">A tiempo</th>
          <th className="pb-3 font-medium text-right pr-4">Atrasados</th>
          <th className="pb-3 font-medium text-right pr-4">Bodega</th>
          <th className="pb-3 font-medium text-right pr-4">Transportista</th>
          <th className="pb-3 font-medium text-right pr-4">% Cumplim.</th>
          <th className="pb-3 font-medium pr-4"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map((row, i) => (
          <tr key={`${row.period}-${row.source}-${row.method}-${i}`} className="hover:bg-gray-50">
            <td className="py-3 text-gray-700 whitespace-nowrap pr-4 capitalize">
              {formatPeriod(row.period)}
            </td>
            <td className="py-3 pr-4">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${SOURCE_COLOR[row.source] || "bg-gray-100 text-gray-700"}`}>
                {SOURCE_LABEL[row.source] ?? row.source}
              </span>
            </td>
            <td className="py-3 pr-4 text-xs text-gray-600">{row.method}</td>
            <td className="py-3 text-right font-medium text-gray-700 pr-4">{row.total}</td>
            <td className="py-3 text-right text-green-700 font-medium pr-4">{row.total - row.delayed}</td>
            <td className="py-3 text-right pr-4">
              {row.delayed > 0 ? (
                <button
                  onClick={() => onClickDelayed(row.period, isWeekly)}
                  className="text-red-600 font-medium hover:underline cursor-pointer"
                >
                  {row.delayed}
                </button>
              ) : (
                <span className="text-gray-400">0</span>
              )}
            </td>
            <td className="py-3 text-right pr-4">
              {row.bodega > 0 ? (
                <span className="text-orange-600 font-medium">{row.bodega}</span>
              ) : (
                <span className="text-gray-400">0</span>
              )}
            </td>
            <td className="py-3 text-right pr-4">
              {row.transportista > 0 ? (
                <span className="text-purple-600 font-medium">{row.transportista}</span>
              ) : (
                <span className="text-gray-400">0</span>
              )}
            </td>
            <td className="py-3 text-right pr-4">
              <ComplianceBadge pct={100 - row.pct_delayed} />
            </td>
            <td className="py-3 pr-4">
              <ComplianceBar pct={100 - row.pct_delayed} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function KpiTable({ metrics }: Props) {
  const [view, setView] = useState<"monthly" | "weekly">("monthly");
  const [mode, setMode] = useState<"aggregate" | "detail">("aggregate");
  const [detailPeriod, setDetailPeriod] = useState<{ period: string; isWeekly: boolean } | null>(null);

  if (!metrics.monthly.length && !metrics.weekly.length) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center">
        Sin datos suficientes para mostrar KPIs.
      </p>
    );
  }

  const handleClickDelayed = (period: string, isWeekly: boolean) => {
    setDetailPeriod({ period, isWeekly });
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <div className="flex gap-1">
          <button
            onClick={() => setView("monthly")}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              view === "monthly"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Mensual
          </button>
          <button
            onClick={() => setView("weekly")}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              view === "weekly"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Semanal
          </button>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setMode("aggregate")}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              mode === "aggregate"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Agregado
          </button>
          <button
            onClick={() => setMode("detail")}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              mode === "detail"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Por fuente
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        {mode === "aggregate" ? (
          view === "monthly" ? (
            <MetricsTable data={metrics.monthly} formatPeriod={formatMonth} isWeekly={false} onClickDelayed={handleClickDelayed} />
          ) : (
            <MetricsTable data={metrics.weekly} formatPeriod={formatWeek} isWeekly={true} onClickDelayed={handleClickDelayed} />
          )
        ) : (
          view === "monthly" ? (
            <DetailMetricsTable data={metrics.monthly_detail} formatPeriod={formatMonth} isWeekly={false} onClickDelayed={handleClickDelayed} />
          ) : (
            <DetailMetricsTable data={metrics.weekly_detail} formatPeriod={formatWeek} isWeekly={true} onClickDelayed={handleClickDelayed} />
          )
        )}
      </div>

      {detailPeriod && (
        <KpiDelayModal
          period={detailPeriod.period}
          isWeekly={detailPeriod.isWeekly}
          onClose={() => setDetailPeriod(null)}
        />
      )}
    </div>
  );
}
