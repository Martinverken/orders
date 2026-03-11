"use client";

import { useState, useEffect } from "react";
import { HistoricalOrder, Order, OrderCase, YesterdayDelays } from "@/app/types";
import {
  SOURCE_LABEL,
  STATUS_LABEL,
  formatDeadline,
  getOrderNumber,
  getShippingMethod,
  getOperator,
  getTrackingCode,
  getTrackingUrl,
  getProductDetails,
  getShippingDestination,
} from "@/app/lib/utils";
import { addOrderCase, addActiveOrderCase, deleteOrderCase, getActiveOrderCases } from "@/app/lib/api";

interface Props {
  data: YesterdayDelays;
}

// Unified shape for the detail modal
interface DetailOrder {
  id: string;
  external_id: string;
  source: string;
  orderNumber: string;
  sourceName: string;
  method: string;
  operator: string;
  blame: string | null;
  location: "historico" | "activo";
  status: string;
  limitBodega: string | null;
  entregaBodega: string | null;
  limitCliente: string | null;
  entregaCliente: string | null;
  delayHrs: number | null;
  daysDelayed: number | null;
  tracking: string;
  trackingUrl: string | null;
  product: string | null;
  destination: string | null;
  cases: OrderCase[];
  raw_data?: Record<string, unknown>;
}

function toDetailFromArchived(o: HistoricalOrder): DetailOrder {
  const tracking = getTrackingCode(o.raw_data);
  const dest = getShippingDestination(o.raw_data);
  const prod = getProductDetails(o.raw_data);
  const method = o.raw_data ? getShippingMethod(o.source, o.raw_data) : "—";
  const isCE = method === "Regular/Centro Envíos";
  // For Shopify orders, prefer Welivery API dates if available
  const isShopify = (o.source || "").startsWith("shopify");
  const entregaBodega = (isShopify && o.welivery_depot_at) ? o.welivery_depot_at : (o.handoff_at || o.delivered_at || null);
  const entregaCliente = isCE
    ? null
    : (isShopify && o.welivery_delivered_at) ? o.welivery_delivered_at : (o.delivered_at || null);
  return {
    id: o.id,
    external_id: o.external_id,
    source: o.source,
    orderNumber: getOrderNumber(o.raw_data, o.external_id),
    sourceName: SOURCE_LABEL[o.source] || o.source,
    method,
    operator: o.logistics_operator || (o.raw_data ? getOperator(o.source, o.raw_data) : "—"),
    blame: o.blame || null,
    location: "historico",
    status: o.status || "archived",
    limitBodega: o.limit_handoff_date || o.limit_delivery_date,
    entregaBodega,
    limitCliente: o.limit_delivery_date,
    entregaCliente,
    delayHrs: o.days_delayed != null ? Math.round(o.days_delayed * 24) : null,
    daysDelayed: o.days_delayed,
    tracking,
    trackingUrl: getTrackingUrl(o.raw_data, tracking),
    product: prod.title || null,
    destination: [dest.comuna, dest.city].filter(Boolean).join(", ") || null,
    cases: o.cases || [],
    raw_data: o.raw_data,
  };
}

function toDetailFromActive(o: Order): DetailOrder {
  const tracking = getTrackingCode(o.raw_data);
  const dest = getShippingDestination(o.raw_data);
  const prod = getProductDetails(o.raw_data, o.product_name, o.product_quantity);
  const isShopify = (o.source || "").startsWith("shopify");
  return {
    id: o.id,
    external_id: o.external_id,
    source: o.source,
    orderNumber: getOrderNumber(o.raw_data, o.external_id),
    sourceName: SOURCE_LABEL[o.source] || o.source,
    method: o.raw_data ? getShippingMethod(o.source, o.raw_data) : "—",
    operator: o.raw_data ? getOperator(o.source, o.raw_data) : "—",
    blame: null,
    location: "activo",
    status: o.status,
    limitBodega: o.limit_handoff_date || o.limit_delivery_date,
    entregaBodega: (isShopify && o.welivery_depot_at) ? o.welivery_depot_at : (o.first_shipped_at || null),
    limitCliente: o.limit_delivery_date,
    entregaCliente: (isShopify && o.welivery_delivered_at) ? o.welivery_delivered_at : null,
    delayHrs: null,
    daysDelayed: null,
    tracking,
    trackingUrl: getTrackingUrl(o.raw_data, tracking),
    product: prod.title || null,
    destination: [dest.comuna, dest.city].filter(Boolean).join(", ") || null,
    cases: [],
    raw_data: o.raw_data,
  };
}

function formatDelayLabel(hrs: number): string {
  if (hrs < 1) return "< 1 hr";
  return `${hrs} ${hrs === 1 ? "hr" : "hrs"}`;
}

const CASE_STATUS_OPTIONS = [
  { value: "", label: "— Sin estado" },
  { value: "created", label: "Creado" },
  { value: "pending", label: "Pendiente" },
  { value: "resolved", label: "Resuelto" },
];

const CASE_STATUS_STYLE: Record<string, string> = {
  created: "bg-blue-100 text-blue-700",
  pending: "bg-amber-100 text-amber-700",
  resolved: "bg-green-100 text-green-700",
};

function formatCaseDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Santiago",
  });
}

// ─── Detail Modal ───────────────────────────────────────────────────────────

function OrderDetailModal({ detail, onClose }: { detail: DetailOrder; onClose: () => void }) {
  const [cases, setCases] = useState<OrderCase[]>(detail.cases);
  const [adding, setAdding] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [newComment, setNewComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"ok" | "error" | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingCases, setLoadingCases] = useState(detail.location === "activo");

  // Load cases for active orders (not preloaded)
  useEffect(() => {
    if (detail.location === "activo") {
      getActiveOrderCases(detail.id).then((c) => {
        setCases(c);
        setLoadingCases(false);
      }).catch(() => setLoadingCases(false));
    }
  }, [detail.id, detail.location]);

  const handleAdd = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const data = {
        case_status: newStatus || null,
        case_number: newNumber.trim() || null,
        comments: newComment.trim() || null,
      };
      const created = detail.location === "historico"
        ? await addOrderCase(detail.id, data)
        : await addActiveOrderCase(detail.id, data);
      setCases((prev) => [...prev, created]);
      setNewStatus("");
      setNewNumber("");
      setNewComment("");
      setAdding(false);
      setSaveResult("ok");
      setTimeout(() => setSaveResult(null), 2000);
    } catch {
      setSaveResult("error");
      setTimeout(() => setSaveResult(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (caseId: string) => {
    setDeletingId(caseId);
    try {
      await deleteOrderCase(caseId);
      setCases((prev) => prev.filter((c) => c.id !== caseId));
    } finally {
      setDeletingId(null);
    }
  };

  const inputClass = "text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-black bg-white text-black placeholder-gray-400 w-full";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Detalle de orden</h2>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">{detail.orderNumber}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide">Fuente</span>
              <p className="text-gray-800 font-medium">{detail.sourceName}</p>
            </div>
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide">Método</span>
              <p className="text-gray-800 font-medium">{detail.method}</p>
            </div>
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide">Operador</span>
              <p className="text-gray-800 font-medium">{detail.operator}</p>
            </div>
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide">Culpa</span>
              <p className="font-medium">
                {detail.blame === "bodega" ? (
                  <span className="text-orange-700">Bodega</span>
                ) : detail.blame === "transportista" ? (
                  <span className="text-purple-700">Transportista</span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </p>
            </div>
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide">Ubicación</span>
              <p className="font-medium">
                {detail.location === "historico" ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">Pedidos históricos</span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">Pedidos activos</span>
                )}
              </p>
            </div>
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide">Estado</span>
              <p className="text-gray-800 font-medium capitalize">{STATUS_LABEL[detail.status] || detail.status}</p>
            </div>
          </div>

          {/* Dates comparison — 4 rows */}
          <div className="bg-red-50 border border-red-100 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 font-medium">Limite bodega</span>
              <span className="text-gray-800 font-mono text-xs">{formatDeadline(detail.limitBodega)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 font-medium">Entrega bodega</span>
              <span className={`font-mono text-xs ${detail.entregaBodega && detail.limitBodega && detail.entregaBodega > detail.limitBodega ? "text-red-600 font-bold" : "text-gray-800"}`}>
                {detail.entregaBodega ? formatDeadline(detail.entregaBodega) : "Pendiente"}
              </span>
            </div>
            <div className="border-t border-red-200 my-1" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 font-medium">Limite cliente</span>
              <span className="text-gray-800 font-mono text-xs">{formatDeadline(detail.limitCliente)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 font-medium">Entrega cliente</span>
              <span className={`font-mono text-xs ${detail.entregaCliente && detail.limitCliente && detail.entregaCliente > detail.limitCliente ? "text-red-600 font-bold" : "text-gray-800"}`}>
                {detail.entregaCliente ? formatDeadline(detail.entregaCliente) : (detail.method === "Regular/Centro Envíos" ? "N/A (transportista)" : "Pendiente")}
              </span>
            </div>
            {detail.delayHrs != null && (
              <div className="flex items-center justify-between text-sm pt-1 border-t border-red-200">
                <span className="text-red-800 font-semibold">Retraso</span>
                <span className="text-red-600 font-bold">+{formatDelayLabel(detail.delayHrs)}</span>
              </div>
            )}
          </div>

          {/* Extra info */}
          {(detail.product || detail.destination || detail.tracking) && (
            <div className="space-y-1 text-sm">
              {detail.product && (
                <div className="flex gap-2">
                  <span className="text-gray-400 text-xs uppercase tracking-wide shrink-0 w-20">Producto</span>
                  <span className="text-gray-700">{detail.product}</span>
                </div>
              )}
              {detail.destination && (
                <div className="flex gap-2">
                  <span className="text-gray-400 text-xs uppercase tracking-wide shrink-0 w-20">Destino</span>
                  <span className="text-gray-700">{detail.destination}</span>
                </div>
              )}
              {detail.tracking && (
                <div className="flex gap-2">
                  <span className="text-gray-400 text-xs uppercase tracking-wide shrink-0 w-20">Tracking</span>
                  {detail.trackingUrl ? (
                    <a href={detail.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-mono text-xs">{detail.tracking}</a>
                  ) : (
                    <span className="text-gray-700 font-mono text-xs">{detail.tracking}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tickets section */}
          <div className="border-t border-gray-100 pt-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tickets</h3>
            {loadingCases ? (
              <p className="text-xs text-gray-400">Cargando tickets...</p>
            ) : (
              <div className="space-y-2">
                {cases.length === 0 && !adding && (
                  <p className="text-xs text-gray-400">No hay tickets</p>
                )}
                {cases.map((c) => (
                  <div key={c.id} className="border border-gray-100 rounded-lg p-2.5 space-y-1">
                    <div className="flex items-center gap-2">
                      {c.case_status && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CASE_STATUS_STYLE[c.case_status] ?? "bg-gray-100 text-gray-600"}`}>
                          {CASE_STATUS_OPTIONS.find((o) => o.value === c.case_status)?.label ?? c.case_status}
                        </span>
                      )}
                      {c.case_number && <span className="font-mono text-xs text-gray-700">{c.case_number}</span>}
                      <span className="text-xs text-gray-400 ml-auto">{c.created_at ? formatCaseDate(c.created_at) : ""}</span>
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={deletingId === c.id}
                        className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40"
                        title="Eliminar"
                      >✕</button>
                    </div>
                    {c.comments && <p className="text-xs text-gray-700 whitespace-pre-wrap leading-snug">{c.comments}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Add ticket footer */}
        <div className="px-5 py-3 border-t border-gray-100">
          {adding ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className={`text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black cursor-pointer text-black bg-white flex-shrink-0 ${newStatus ? CASE_STATUS_STYLE[newStatus] : ""}`}
                >
                  {CASE_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newNumber}
                  placeholder="N° caso"
                  maxLength={80}
                  onChange={(e) => setNewNumber(e.target.value)}
                  className={inputClass}
                />
              </div>
              <textarea
                value={newComment}
                placeholder="Comentario"
                maxLength={2000}
                rows={2}
                onChange={(e) => setNewComment(e.target.value)}
                className="text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-black bg-white text-black placeholder-gray-400 w-full resize-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAdd}
                  disabled={saving}
                  className="text-sm bg-black text-white rounded px-3 py-1.5 hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
                <button
                  onClick={() => { setAdding(false); setNewStatus(""); setNewNumber(""); setNewComment(""); }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancelar
                </button>
                {saveResult === "ok" && <span className="text-sm text-green-600 font-medium">Guardado</span>}
                {saveResult === "error" && <span className="text-sm text-red-600">Error al guardar</span>}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setAdding(true)}
                className="text-sm border border-black text-black rounded px-3 py-1.5 hover:bg-gray-100"
              >
                + Agregar ticket
              </button>
              {saveResult === "ok" && <span className="text-sm text-green-600 font-medium">Guardado</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function YesterdayDelaysSummary({ data }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<DetailOrder | null>(null);

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
                      <th className="pb-2 pr-3 font-medium">Operador</th>
                      <th className="pb-2 pr-3 font-medium">Culpa</th>
                      <th className="pb-2 pr-3 font-medium">Lim. bodega</th>
                      <th className="pb-2 pr-3 font-medium">Entreg. bodega</th>
                      <th className="pb-2 pr-3 font-medium">Lim. cliente</th>
                      <th className="pb-2 pr-3 font-medium">Entreg. cliente</th>
                      <th className="pb-2 font-medium">Retraso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.archived_delayed.map((order) => {
                      const hrs = Math.round(order.days_delayed * 24);
                      const method = order.raw_data ? getShippingMethod(order.source, order.raw_data) : "";
                      const isCE = method === "Regular/Centro Envíos";
                      const isShopify = (order.source || "").startsWith("shopify");
                      const entregaBodega = (isShopify && order.welivery_depot_at) ? order.welivery_depot_at : (order.handoff_at || order.delivered_at || null);
                      const entregaCliente = isCE
                        ? null
                        : (isShopify && order.welivery_delivered_at) ? order.welivery_delivered_at : (order.delivered_at || null);
                      return (
                        <tr
                          key={order.id}
                          className="border-b border-red-100 cursor-pointer hover:bg-red-100/60 transition-colors"
                          onClick={() => setSelectedOrder(toDetailFromArchived(order))}
                        >
                          <td className="py-2 pr-3 font-mono text-gray-700">
                            {getOrderNumber(order.raw_data, order.external_id)}
                          </td>
                          <td className="py-2 pr-3 text-gray-600">
                            {SOURCE_LABEL[order.source] || order.source}
                          </td>
                          <td className="py-2 pr-3 text-gray-500">
                            {order.logistics_operator || (order.raw_data ? getOperator(order.source, order.raw_data) : "—")}
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
                            {formatDeadline(entregaBodega)}
                          </td>
                          <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">
                            {formatDeadline(order.limit_delivery_date)}
                          </td>
                          <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">
                            {isCE ? <span className="text-gray-300">N/A</span> : formatDeadline(entregaCliente)}
                          </td>
                          <td className="py-2 text-red-600 font-medium whitespace-nowrap">
                            +{formatDelayLabel(hrs)}
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
                      <th className="pb-2 pr-3 font-medium">Operador</th>
                      <th className="pb-2 pr-3 font-medium">Estado</th>
                      <th className="pb-2 pr-3 font-medium">Lim. bodega</th>
                      <th className="pb-2 pr-3 font-medium">Entreg. bodega</th>
                      <th className="pb-2 pr-3 font-medium">Lim. cliente</th>
                      <th className="pb-2 font-medium">Entreg. cliente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.active_overdue.map((order) => {
                      const method = order.raw_data ? getShippingMethod(order.source, order.raw_data) : "";
                      const isCE = method === "Regular/Centro Envíos";
                      const isShopify = (order.source || "").startsWith("shopify");
                      const entregaBodega = (isShopify && order.welivery_depot_at) ? order.welivery_depot_at : (order.first_shipped_at || null);
                      const entregaCliente = isCE
                        ? null
                        : (isShopify && order.welivery_delivered_at) ? order.welivery_delivered_at : null;
                      return (
                        <tr
                          key={order.id}
                          className="border-b border-red-100 cursor-pointer hover:bg-red-100/60 transition-colors"
                          onClick={() => setSelectedOrder(toDetailFromActive(order))}
                        >
                          <td className="py-2 pr-3 font-mono text-gray-700">
                            {getOrderNumber(order.raw_data, order.external_id)}
                          </td>
                          <td className="py-2 pr-3 text-gray-600">{SOURCE_LABEL[order.source] || order.source}</td>
                          <td className="py-2 pr-3 text-gray-500">
                            {order.raw_data ? getOperator(order.source, order.raw_data) : "—"}
                          </td>
                          <td className="py-2 pr-3 text-gray-600 capitalize">{STATUS_LABEL[order.status] || order.status}</td>
                          <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">
                            {formatDeadline(order.limit_handoff_date || order.limit_delivery_date)}
                          </td>
                          <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">
                            {entregaBodega ? formatDeadline(entregaBodega) : <span className="text-gray-300">Pendiente</span>}
                          </td>
                          <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">
                            {formatDeadline(order.limit_delivery_date)}
                          </td>
                          <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">
                            {isCE ? <span className="text-gray-300">N/A</span> : (entregaCliente ? formatDeadline(entregaCliente) : <span className="text-gray-300">Pendiente</span>)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedOrder && (
        <OrderDetailModal detail={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}
    </div>
  );
}
