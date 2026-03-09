"use client";

import { useState } from "react";
import { HistoricalMetrics, HistoricalOrder } from "@/app/types";
import { getHistoricalOrders } from "@/app/lib/api";
import { SOURCE_LABEL, formatDeadline, getCreatedAt, getOrderNumber, getProductDetails, getShippingDestination, getTrackingCode, getTrackingUrl } from "@/app/lib/utils";

interface Props {
  metrics: HistoricalMetrics;
}

interface MergedRow {
  month: string;
  source: string;
  logistics_operator: string;
  on_time: number;
  delayed: number;
  avg_days_delayed: number;
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1);
  return date.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
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

function mergeMetrics(metrics: HistoricalMetrics): Map<string, MergedRow> {
  const map = new Map<string, MergedRow>();

  const key = (month: string, source: string, op: string) =>
    `${month}|${source}|${op}`;

  for (const m of metrics.on_time) {
    const k = key(m.month, m.source, m.logistics_operator);
    if (!map.has(k)) {
      map.set(k, { month: m.month, source: m.source, logistics_operator: m.logistics_operator, on_time: 0, delayed: 0, avg_days_delayed: 0 });
    }
    map.get(k)!.on_time += m.count;
  }

  for (const m of metrics.delayed) {
    const k = key(m.month, m.source, m.logistics_operator);
    if (!map.has(k)) {
      map.set(k, { month: m.month, source: m.source, logistics_operator: m.logistics_operator, on_time: 0, delayed: 0, avg_days_delayed: 0 });
    }
    const row = map.get(k)!;
    row.delayed += m.count;
    row.avg_days_delayed = m.avg_days_delayed;
  }

  return map;
}

function DelayDetailModal({ row, onClose }: { row: MergedRow; onClose: () => void }) {
  const [orders, setOrders] = useState<HistoricalOrder[] | null>(null);
  const [loading, setLoading] = useState(true);

  useState(() => {
    getHistoricalOrders({
      source: row.source,
      logistics_operator: row.logistics_operator,
      urgency: "atrasado",
      month: row.month,
      per_page: 100,
    })
      .then((page) => setOrders(page.data))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-5xl w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium text-gray-900">
              Pedidos atrasados — {formatMonth(row.month)}
            </h3>
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
                  <th className="pb-3 font-medium">Ciudad</th>
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
                      <td className="py-2.5 pr-4 font-mono text-xs text-gray-700">{orderNumber}</td>
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
                      <td className="py-2.5 text-xs text-gray-600 capitalize">{order.raw_data ? getShippingDestination(order.raw_data).city?.toLowerCase() || "—" : "—"}</td>
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

export function DelayMetricsTable({ metrics }: Props) {
  const [detailRow, setDetailRow] = useState<MergedRow | null>(null);
  const rowMap = mergeMetrics(metrics);

  if (rowMap.size === 0) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center">
        Sin datos históricos aún. Los registros aparecerán cuando las órdenes alcancen su fecha límite.
      </p>
    );
  }

  // Sort: most recent month first, then by source
  const rows = Array.from(rowMap.values()).sort((a, b) =>
    b.month.localeCompare(a.month) || a.source.localeCompare(b.source)
  );

  // Group by month for row-spanning the month label
  const byMonth = rows.reduce<Record<string, MergedRow[]>>((acc, r) => {
    if (!acc[r.month]) acc[r.month] = [];
    acc[r.month].push(r);
    return acc;
  }, {});
  const months = Object.keys(byMonth).sort().reverse();

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="pb-3 font-medium pr-6">Mes</th>
              <th className="pb-3 font-medium pr-4">Marketplace</th>
              <th className="pb-3 font-medium pr-4">Operador logístico</th>
              <th className="pb-3 font-medium text-right pr-4">Total</th>
              <th className="pb-3 font-medium text-right pr-4">A tiempo</th>
              <th className="pb-3 font-medium text-right pr-4">% cumplim.</th>
              <th className="pb-3 font-medium text-right pr-4">Atrasados</th>
              <th className="pb-3 font-medium text-right">Atraso Promedio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {months.map((month) =>
              byMonth[month].map((row, i) => {
                const total = row.on_time + row.delayed;
                const compliance = total > 0 ? Math.round((row.on_time / total) * 100) : null;
                return (
                  <tr key={`${month}-${row.source}-${row.logistics_operator}`} className="hover:bg-gray-50">
                    <td className="py-3 text-gray-700 whitespace-nowrap pr-6 capitalize">
                      {i === 0 ? formatMonth(month) : ""}
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
                          compliance >= 90
                            ? "bg-green-100 text-green-700"
                            : compliance >= 70
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                        }`}>
                          {compliance}%
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right pr-4">
                      {row.delayed > 0 ? (
                        <button
                          onClick={() => setDetailRow(row)}
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
      </div>
      {detailRow && <DelayDetailModal row={detailRow} onClose={() => setDetailRow(null)} />}
    </>
  );
}
