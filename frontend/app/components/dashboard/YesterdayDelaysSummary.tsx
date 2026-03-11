"use client";

import { useState } from "react";
import { YesterdayDelays } from "@/app/types";
import { SOURCE_LABEL, formatDeadline, getOrderNumber, getShippingMethod } from "@/app/lib/utils";

interface Props {
  data: YesterdayDelays;
}

export function YesterdayDelaysSummary({ data }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (data.total === 0) return null;

  const dateLabel = new Date(data.date + "T12:00:00").toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{"!"}</span>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-red-800">
              {data.total} pedido{data.total !== 1 ? "s" : ""} atrasado{data.total !== 1 ? "s" : ""} ayer ({dateLabel})
            </h3>
            <p className="text-xs text-red-600">
              {data.archived_delayed_count > 0 && `${data.archived_delayed_count} archivado${data.archived_delayed_count !== 1 ? "s" : ""}`}
              {data.archived_delayed_count > 0 && data.active_overdue_count > 0 && " + "}
              {data.active_overdue_count > 0 && `${data.active_overdue_count} aun pendiente${data.active_overdue_count !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <span className="text-red-400 text-xs">{expanded ? "Ocultar" : "Ver detalle"}</span>
      </button>

      {expanded && (
        <div className="mt-4 space-y-3">
          {data.archived_delayed.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-red-700 mb-2 uppercase tracking-wide">Archivados con atraso</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-red-200 text-left text-red-600">
                      <th className="pb-2 pr-3 font-medium">Order N</th>
                      <th className="pb-2 pr-3 font-medium">Fuente</th>
                      <th className="pb-2 pr-3 font-medium">Metodo</th>
                      <th className="pb-2 pr-3 font-medium">Culpa</th>
                      <th className="pb-2 pr-3 font-medium">Limite</th>
                      <th className="pb-2 pr-3 font-medium">Entrega</th>
                      <th className="pb-2 font-medium">Retraso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.archived_delayed.map((order) => {
                      const hrs = Math.round(order.days_delayed * 24);
                      return (
                        <tr key={order.id} className="border-b border-red-100">
                          <td className="py-2 pr-3 font-mono text-gray-700">
                            {getOrderNumber(order.raw_data, order.external_id)}
                          </td>
                          <td className="py-2 pr-3 text-gray-600">{SOURCE_LABEL[order.source] || order.source}</td>
                          <td className="py-2 pr-3 text-gray-500">
                            {order.raw_data ? getShippingMethod(order.source, order.raw_data) : "—"}
                          </td>
                          <td className="py-2 pr-3">
                            {order.blame === "bodega" ? (
                              <span className="text-orange-700 font-medium">Bodega</span>
                            ) : order.blame === "transportista" ? (
                              <span className="text-purple-700 font-medium">Transportista</span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">
                            {formatDeadline(order.limit_handoff_date || order.limit_delivery_date)}
                          </td>
                          <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">
                            {formatDeadline(order.handoff_at || order.delivered_at || order.resolved_at)}
                          </td>
                          <td className="py-2 text-red-600 font-medium whitespace-nowrap">
                            +{hrs} {hrs === 1 ? "hr" : "hrs"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.active_overdue.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-red-700 mb-2 uppercase tracking-wide">Aun pendientes de ayer</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-red-200 text-left text-red-600">
                      <th className="pb-2 pr-3 font-medium">Order N</th>
                      <th className="pb-2 pr-3 font-medium">Fuente</th>
                      <th className="pb-2 pr-3 font-medium">Estado</th>
                      <th className="pb-2 font-medium">Limite bodega</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.active_overdue.map((order) => (
                      <tr key={order.id} className="border-b border-red-100">
                        <td className="py-2 pr-3 font-mono text-gray-700">
                          {getOrderNumber(order.raw_data, order.external_id)}
                        </td>
                        <td className="py-2 pr-3 text-gray-600">{SOURCE_LABEL[order.source] || order.source}</td>
                        <td className="py-2 pr-3 text-gray-600 capitalize">{order.status}</td>
                        <td className="py-2 text-gray-600 whitespace-nowrap">
                          {formatDeadline(order.limit_handoff_date || order.limit_delivery_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
