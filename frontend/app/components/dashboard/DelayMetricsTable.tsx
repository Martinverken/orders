"use client";

import { useState } from "react";
import { DelayMetric, HistoricalMetrics, HistoricalOrder, OnTimeMetric, OrderCase } from "@/app/types";
import { getHistoricalOrders, addOrderCase } from "@/app/lib/api";
import { SOURCE_LABEL, formatDeadline, getCreatedAt, getOrderNumber, getProductDetails, getShippingDestination, getTrackingCode, getTrackingUrl, getBultoCount } from "@/app/lib/utils";
import { CaseHistoryModal } from "./CaseHistoryModal";

interface Props {
  metrics: HistoricalMetrics;
}

interface MergedRow {
  period: string;
  source: string;
  logistics_operator: string;
  on_time: number;
  delayed: number;
  avg_days_delayed: number;
  isWeekly?: boolean;
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

function SourceBadge({ source }: { source: string }) {
  const cls =
    source === "falabella"
      ? "bg-orange-100 text-orange-700"
      : source.startsWith("shopify")
      ? "bg-green-100 text-green-700"
      : source === "walmart"
      ? "bg-blue-100 text-blue-700"
      : source === "paris"
      ? "bg-purple-100 text-purple-700"
      : "bg-yellow-100 text-yellow-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {SOURCE_LABEL[source] ?? source}
    </span>
  );
}

function mergeFromArrays(
  onTimeArr: OnTimeMetric[],
  delayedArr: DelayMetric[],
  isWeekly: boolean,
): Map<string, MergedRow> {
  const map = new Map<string, MergedRow>();
  const k = (period: string, source: string, op: string) => `${period}|${source}|${op}`;

  for (const m of onTimeArr) {
    const key = k(m.month, m.source, m.logistics_operator);
    if (!map.has(key)) {
      map.set(key, { period: m.month, source: m.source, logistics_operator: m.logistics_operator, on_time: 0, delayed: 0, avg_days_delayed: 0, isWeekly });
    }
    map.get(key)!.on_time += m.count;
  }

  for (const m of delayedArr) {
    const key = k(m.month, m.source, m.logistics_operator);
    if (!map.has(key)) {
      map.set(key, { period: m.month, source: m.source, logistics_operator: m.logistics_operator, on_time: 0, delayed: 0, avg_days_delayed: 0, isWeekly });
    }
    const row = map.get(key)!;
    row.delayed += m.count;
    row.avg_days_delayed = m.avg_days_delayed;
  }

  return map;
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

function DelayDetailModal({ row, onClose }: { row: MergedRow; onClose: () => void }) {
  const [orders, setOrders] = useState<HistoricalOrder[] | null>(null);
  const [loading, setLoading] = useState(true);

  useState(() => {
    const params: Record<string, unknown> = {
      source: row.source,
      logistics_operator: row.logistics_operator,
      urgency: "atrasado",
      per_page: 100,
    };
    if (row.isWeekly) {
      // period is Monday date "YYYY-MM-DD"
      const monday = new Date(row.period + "T00:00:00");
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      params.date_from = row.period;
      params.date_to = sunday.toLocaleDateString("sv");
    } else {
      params.month = row.period;
    }
    getHistoricalOrders(params as Parameters<typeof getHistoricalOrders>[0])
      .then((page) => setOrders(page.data))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  });

  const title = row.isWeekly
    ? `Pedidos atrasados — ${formatWeek(row.period)}`
    : `Pedidos atrasados — ${formatMonth(row.period)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-6xl w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {SOURCE_LABEL[row.source] ?? row.source} / {row.logistics_operator}
            </p>
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
                  <th className="pb-3 pr-4 font-medium">Producto</th>
                  <th className="pb-3 pr-4 font-medium">Estado</th>
                  <th className="pb-3 pr-4 font-medium">Fecha Orden</th>
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
                      <td className={`py-2.5 pr-4 font-mono text-xs ${(order.cases?.length ?? 0) > 0 ? "text-amber-600 font-semibold" : "text-gray-700"}`}>
                        <span className="flex items-center gap-1.5">
                          {orderNumber}
                          {(() => {
                            const bultos = getBultoCount(order.raw_data);
                            return bultos > 1 ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600">
                                {bultos} bultos
                              </span>
                            ) : null;
                          })()}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-gray-600 max-w-[140px] truncate">{product.sku || "—"}</td>
                      <td className="py-2.5 pr-4 text-xs text-gray-600">{order.status || "—"}</td>
                      <td className="py-2.5 pr-4 text-xs text-gray-600 whitespace-nowrap">{formatDeadline(getCreatedAt(order.raw_data))}</td>
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

function MetricsTableView({
  rows,
  periodLabel,
  formatPeriod,
  onDetailRow,
}: {
  rows: MergedRow[];
  periodLabel: string;
  formatPeriod: (p: string) => string;
  onDetailRow: (row: MergedRow) => void;
}) {
  // Group by period
  const byPeriod = rows.reduce<Record<string, MergedRow[]>>((acc, r) => {
    if (!acc[r.period]) acc[r.period] = [];
    acc[r.period].push(r);
    return acc;
  }, {});
  const periods = Object.keys(byPeriod).sort().reverse();

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
          <th className="pb-3 font-medium pr-6">{periodLabel}</th>
          <th className="pb-3 font-medium pr-4">Marketplace</th>
          <th className="pb-3 font-medium pr-4">Operador logístico</th>
          <th className="pb-3 font-medium text-right pr-4">Total</th>
          <th className="pb-3 font-medium text-right pr-4">A tiempo</th>
          <th className="pb-3 font-medium text-right pr-4">% cumplim. <span className="text-gray-400 font-normal">(obj. &ge;95%)</span></th>
          <th className="pb-3 font-medium text-right pr-4">Atrasados</th>
          <th className="pb-3 font-medium text-right">Atraso Promedio</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {periods.map((period) =>
          byPeriod[period].map((row, i) => {
            const total = row.on_time + row.delayed;
            const compliance = total > 0 ? Math.round((row.on_time / total) * 100) : null;
            return (
              <tr key={`${period}-${row.source}-${row.logistics_operator}`} className="hover:bg-gray-50">
                <td className="py-3 text-gray-700 whitespace-nowrap pr-6 capitalize">
                  {i === 0 ? formatPeriod(period) : ""}
                </td>
                <td className="py-3 pr-4">
                  <SourceBadge source={row.source} />
                </td>
                <td className="py-3 text-gray-600 pr-4">{row.logistics_operator}</td>
                <td className="py-3 text-right font-medium text-gray-700 pr-4">{total}</td>
                <td className="py-3 text-right text-green-700 font-medium pr-4">{row.on_time}</td>
                <td className="py-3 text-right pr-4">
                  {compliance !== null && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      compliance >= 95
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {compliance}%
                    </span>
                  )}
                </td>
                <td className="py-3 text-right pr-4">
                  {row.delayed > 0 ? (
                    <button
                      onClick={() => onDetailRow(row)}
                      className="text-red-600 font-medium hover:underline cursor-pointer"
                    >
                      {row.delayed}
                    </button>
                  ) : (
                    <span className="text-gray-400">0</span>
                  )}
                </td>
                <td className="py-3 text-right text-gray-500">
                  {row.delayed > 0 ? (() => { const hrs = Math.round(row.avg_days_delayed * 24); return `${hrs} ${hrs === 1 ? "hr" : "hrs"}`; })() : "—"}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

export function DelayMetricsTable({ metrics }: Props) {
  const [detailRow, setDetailRow] = useState<MergedRow | null>(null);
  const [view, setView] = useState<"monthly" | "weekly">("monthly");

  const monthlyMap = mergeFromArrays(metrics.on_time, metrics.delayed, false);
  const weeklyMap = mergeFromArrays(metrics.on_time_weekly ?? [], metrics.delayed_weekly ?? [], true);

  if (monthlyMap.size === 0 && weeklyMap.size === 0) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center">
        Sin datos históricos aún. Los registros aparecerán cuando las órdenes alcancen su fecha límite.
      </p>
    );
  }

  const monthlyRows = Array.from(monthlyMap.values()).sort((a, b) =>
    b.period.localeCompare(a.period) || a.source.localeCompare(b.source)
  );
  const weeklyRows = Array.from(weeklyMap.values()).sort((a, b) =>
    b.period.localeCompare(a.period) || a.source.localeCompare(b.source)
  );

  return (
    <>
      <div className="flex gap-1 mb-4">
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

      <div className="overflow-x-auto">
        {view === "monthly" ? (
          <MetricsTableView
            rows={monthlyRows}
            periodLabel="Mes"
            formatPeriod={formatMonth}
            onDetailRow={setDetailRow}
          />
        ) : (
          <MetricsTableView
            rows={weeklyRows}
            periodLabel="Semana"
            formatPeriod={formatWeek}
            onDetailRow={setDetailRow}
          />
        )}
      </div>

      {detailRow && <DelayDetailModal row={detailRow} onClose={() => setDetailRow(null)} />}
    </>
  );
}
