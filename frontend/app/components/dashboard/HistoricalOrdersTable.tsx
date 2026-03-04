"use client";

import { useRef, useState } from "react";
import { HistoricalOrder } from "@/app/types";
import { SOURCE_LABEL, formatDeadline, getCarrier, getCreatedAt, getOrderNumber, getProductDetails, getShippingDestination, getTrackingCode, getTrackingUrl } from "@/app/lib/utils";
import { updateHistoricalOrderCase } from "@/app/lib/api";

interface Props {
  orders: HistoricalOrder[];
}

const STATUS_LABEL: Record<string, string> = {
  delivered: "Entregado",
  shipped: "Despachado",
  ready_to_ship: "Listo para envío",
  pending: "Pendiente",
  cancelled: "Cancelado",
};

const STATUS_COLOR: Record<string, string> = {
  delivered: "bg-green-100 text-green-700",
  shipped: "bg-blue-100 text-blue-700",
  ready_to_ship: "bg-yellow-100 text-yellow-700",
  pending: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-700",
};

function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-gray-400">—</span>;
  const label = STATUS_LABEL[status] ?? status;
  const color = STATUS_COLOR[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

function HistoricalUrgencyBadge({ daysDelayed }: { daysDelayed: number }) {
  if (daysDelayed > 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        Atrasado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
      A tiempo
    </span>
  );
}

function CaseCells({ order }: { order: HistoricalOrder }) {
  const [caseNumber, setCaseNumber] = useState(order.case_number ?? "");
  const [comments, setComments] = useState(order.comments ?? "");
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = (newCase: string, newComments: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await updateHistoricalOrderCase(
          order.id,
          newCase.trim() || null,
          newComments.trim() || null,
        );
      } finally {
        setSaving(false);
      }
    }, 600);
  };

  return (
    <>
      <td className="py-3 pr-4">
        <input
          type="text"
          value={caseNumber}
          placeholder="—"
          maxLength={80}
          onChange={(e) => {
            setCaseNumber(e.target.value);
            save(e.target.value, comments);
          }}
          className="w-24 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white placeholder-gray-300"
        />
      </td>
      <td className="py-3 pr-4">
        <input
          type="text"
          value={comments}
          placeholder="—"
          maxLength={300}
          onChange={(e) => {
            setComments(e.target.value);
            save(caseNumber, e.target.value);
          }}
          className={`w-48 text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white placeholder-gray-300 transition-colors ${saving ? "border-blue-300" : "border-gray-200"}`}
        />
      </td>
    </>
  );
}

export function HistoricalOrdersTable({ orders }: Props) {
  if (!orders.length) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="text-4xl mb-3">📦</div>
        <p>No hay pedidos históricos con estos filtros</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wide">
            <th className="pb-3 pr-4 font-medium">#</th>
            <th className="pb-3 pr-4 font-medium">Order N°</th>
            <th className="pb-3 pr-4 font-medium">Producto</th>
            <th className="pb-3 pr-4 font-medium">Fuente</th>
            <th className="pb-3 pr-4 font-medium">Estado</th>
            <th className="pb-3 pr-4 font-medium">Resultado</th>
            <th className="pb-3 pr-4 font-medium">Fecha Orden</th>
            <th className="pb-3 pr-4 font-medium">Fecha límite</th>
            <th className="pb-3 pr-4 font-medium">Fecha entrega</th>
            <th className="pb-3 pr-4 font-medium">Retraso</th>
            <th className="pb-3 pr-4 font-medium">Operador logístico</th>
            <th className="pb-3 pr-4 font-medium">Tracking</th>
            <th className="pb-3 pr-4 font-medium">Ciudad</th>
            <th className="pb-3 pr-4 font-medium">Comuna</th>
            <th className="pb-3 pr-4 font-medium">Comprobante</th>
            <th className="pb-3 pr-4 font-medium">N° Caso</th>
            <th className="pb-3 font-medium">Comentarios</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order, idx) => {
            const carrier = getCarrier(order.raw_data);
            const orderNumber = getOrderNumber(order.raw_data, order.external_id);
            const tracking = getTrackingCode(order.raw_data);
            const trackingUrl = getTrackingUrl(order.raw_data, tracking);
            const product = getProductDetails(order.raw_data, null, null);
            const destination = getShippingDestination(order.raw_data);
            const isDelayed = order.days_delayed > 0;
            return (
              <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="py-3 pr-4 text-gray-400 text-xs">{idx + 1}</td>
                <td className="py-3 pr-4 font-mono text-gray-700 text-xs">{orderNumber}</td>
                <td className="py-3 pr-4 max-w-[160px]">
                  {product.sku || product.title ? (
                    <div className="relative group">
                      <span className="block truncate font-mono text-xs text-gray-700 cursor-pointer">
                        {product.sku || "—"}
                      </span>
                      <div className="absolute z-20 hidden group-hover:block bg-white shadow-xl border border-gray-200 rounded-lg p-3 min-w-[220px] text-sm left-0 top-6 pointer-events-none">
                        {product.title && <p className="font-medium text-gray-800 leading-snug">{product.title}</p>}
                        <p className="text-gray-500 mt-1 text-xs">Cant.: {product.quantity ?? 1}</p>
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-gray-600">
                  {SOURCE_LABEL[order.source] || order.source}
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge status={order.status} />
                </td>
                <td className="py-3 pr-4">
                  <HistoricalUrgencyBadge daysDelayed={order.days_delayed} />
                </td>
                <td className="py-3 pr-4 text-gray-600 whitespace-nowrap text-sm">
                  {formatDeadline(getCreatedAt(order.raw_data))}
                </td>
                <td className="py-3 pr-4 text-gray-600 whitespace-nowrap text-sm">
                  {formatDeadline(order.limit_delivery_date)}
                </td>
                <td className="py-3 pr-4 text-gray-600 whitespace-nowrap text-sm">
                  {order.delivered_at ? formatDeadline(order.delivered_at) : "—"}
                </td>
                <td className="py-3 pr-4 text-sm whitespace-nowrap">
                  {isDelayed ? (
                    <span className="text-red-600 font-medium">
                      +{Math.round(order.days_delayed * 24)} {Math.round(order.days_delayed * 24) === 1 ? "hr" : "hrs"}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-gray-500 text-xs">
                  {carrier || order.logistics_operator || "—"}
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-gray-600">
                  {trackingUrl ? (
                    <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {tracking}
                    </a>
                  ) : (tracking || "—")}
                </td>
                <td className="py-3 pr-4 text-gray-600 text-xs capitalize">
                  {destination.city?.toLowerCase() || "—"}
                </td>
                <td className="py-3 pr-4 text-gray-600 text-xs capitalize">
                  {destination.comuna?.toLowerCase() || "—"}
                </td>
                <td className="py-3 pr-4 text-xs">
                  {order.comprobante ? (
                    <a
                      href={order.comprobante}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline whitespace-nowrap"
                    >
                      Ver PDF
                    </a>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <CaseCells order={order} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
