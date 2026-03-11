"use client";

import { useState, useEffect } from "react";
import { DailyDelays, DailyDelaysDay, HistoricalOrder, OrderCase } from "@/app/types";
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
  getCreatedAt,
  getBultoCount,
} from "@/app/lib/utils";
import { addOrderCase, deleteOrderCase, fetchWeliveryBatch } from "@/app/lib/api";

interface Props {
  data: DailyDelays;
  currentMonth?: string;
}

interface DetailOrder {
  id: string;
  external_id: string;
  source: string;
  orderNumber: string;
  sourceName: string;
  method: string;
  operator: string;
  blame: string | null;
  location: "historico";
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
  createdAt: string | null;
  destination: string | null;
  hasClientDeadline: boolean;
  cases: OrderCase[];
  raw_data?: Record<string, unknown>;
}

function toDetail(o: HistoricalOrder, wDates?: { depot_at: string | null; delivered_at: string | null }): DetailOrder {
  const tracking = getTrackingCode(o.raw_data);
  const dest = getShippingDestination(o.raw_data);
  const prod = getProductDetails(o.raw_data);
  const method = o.raw_data ? getShippingMethod(o.source, o.raw_data) : "—";
  const isCE = method === "Regular/Centro Envíos";
  const isShopify = (o.source || "").startsWith("shopify");
  const hasClientDeadline = !isCE || isShopify;
  const depotAt = wDates?.depot_at ?? o.welivery_depot_at;
  const deliveredAt = wDates?.delivered_at ?? o.welivery_delivered_at;
  const entregaBodega = (isShopify && depotAt) ? depotAt : (o.handoff_at || o.delivered_at || null);
  const entregaCliente = hasClientDeadline
    ? ((isShopify && deliveredAt) ? deliveredAt : (o.delivered_at || null))
    : null;
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
    limitCliente: hasClientDeadline ? o.limit_delivery_date : null,
    entregaCliente,
    createdAt: getCreatedAt(o.raw_data),
    delayHrs: o.days_delayed != null ? Math.round(o.days_delayed * 24) : null,
    daysDelayed: o.days_delayed,
    tracking,
    trackingUrl: getTrackingUrl(o.raw_data, tracking),
    product: prod.title || null,
    destination: [dest.comuna, dest.city].filter(Boolean).join(", ") || null,
    hasClientDeadline,
    cases: o.cases || [],
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

function formatDayLabel(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
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

  const handleAdd = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const data = {
        case_status: newStatus || null,
        case_number: newNumber.trim() || null,
        comments: newComment.trim() || null,
      };
      const created = await addOrderCase(detail.id, data);
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Detalle de orden</h2>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">{detail.orderNumber}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
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
              <span className="text-gray-400 text-xs uppercase tracking-wide">Estado</span>
              <p className="text-gray-800 font-medium capitalize">{STATUS_LABEL[detail.status] || detail.status}</p>
            </div>
          </div>

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
              <span className="text-gray-800 font-mono text-xs">{detail.hasClientDeadline ? formatDeadline(detail.limitCliente) : "N/A (transportista)"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 font-medium">Entrega cliente</span>
              <span className={`font-mono text-xs ${detail.entregaCliente && detail.limitCliente && detail.entregaCliente > detail.limitCliente ? "text-red-600 font-bold" : "text-gray-800"}`}>
                {detail.hasClientDeadline ? (detail.entregaCliente ? formatDeadline(detail.entregaCliente) : "Pendiente") : "N/A (transportista)"}
              </span>
            </div>
            {detail.delayHrs != null && (
              <div className="flex items-center justify-between text-sm pt-1 border-t border-red-200">
                <span className="text-red-800 font-semibold">Retraso</span>
                <span className="text-red-600 font-bold">+{formatDelayLabel(detail.delayHrs)}</span>
              </div>
            )}
          </div>

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

          <div className="border-t border-gray-100 pt-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tickets</h3>
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
          </div>
        </div>

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

// ─── Day Row ─────────────────────────────────────────────────────────────────

function getWeliveryId(order: HistoricalOrder): string | null {
  const raw = order.raw_data || {};
  const fulfillments = (raw.fulfillments as Array<Record<string, unknown>>) || [];
  if (fulfillments.length === 1 && typeof fulfillments[0] === "object") {
    const tn = fulfillments[0]?.tracking_number;
    if (tn) return String(tn);
  }
  const name = String(raw.name || "").replace(/^#/, "");
  return name || null;
}

function DaySection({ day }: { day: DailyDelaysDay }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<DetailOrder | null>(null);
  const [weliveryData, setWeliveryData] = useState<Record<string, { status: string; depot_at: string | null; delivered_at: string | null }>>({});
  const [weliveryLoaded, setWeliveryLoaded] = useState(false);

  const dateLabel = formatDayLabel(day.date);
  const activeCount = day.orders.filter((o) => (o as HistoricalOrder & { _active?: boolean })._active).length;
  const totalPackages = day.orders.reduce((sum, o) => sum + getBultoCount(o.raw_data), 0);
  const showPackages = totalPackages > day.count;

  const handleExpand = () => {
    const wasExpanded = expanded;
    setExpanded(!expanded);
    if (!wasExpanded && !weliveryLoaded) {
      // Collect Welivery IDs from Shopify orders
      const ids: string[] = [];
      for (const o of day.orders) {
        if ((o.source || "").startsWith("shopify")) {
          const wid = getWeliveryId(o);
          if (wid) ids.push(wid);
        }
      }
      if (ids.length > 0) {
        fetchWeliveryBatch(ids).then((data) => {
          setWeliveryData(data);
          setWeliveryLoaded(true);
        });
      } else {
        setWeliveryLoaded(true);
      }
    }
  };

  // Helper to get Welivery dates for a Shopify order
  const getWeliveryDates = (order: HistoricalOrder) => {
    const wid = getWeliveryId(order);
    if (wid && weliveryData[wid]) {
      return { depot_at: weliveryData[wid].depot_at, delivered_at: weliveryData[wid].delivered_at };
    }
    return { depot_at: null, delivered_at: null };
  };

  return (
    <div className="border border-red-200 rounded-lg overflow-hidden">
      <button
        onClick={handleExpand}
        className="w-full flex items-center justify-between px-4 py-3 bg-red-50 hover:bg-red-100/80 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-red-800 capitalize">{dateLabel}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-200 text-red-800">
            {day.count} orden{day.count !== 1 ? "es" : ""}{showPackages ? `, ${totalPackages} paquete${totalPackages !== 1 ? "s" : ""}` : ""}
          </span>
          {activeCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-200 text-amber-800">
              {activeCount} activo{activeCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <span className="text-red-400 text-xs">{expanded ? "Ocultar" : "Ver detalle"}</span>
      </button>

      {expanded && (
        <div className="px-4 py-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-red-200 text-left text-red-600">
                  <th className="pb-2 pr-3 font-medium">Order N</th>
                  <th className="pb-2 pr-3 font-medium">Fuente</th>
                  <th className="pb-2 pr-3 font-medium">Fecha orden</th>
                  <th className="pb-2 pr-3 font-medium">Operador</th>
                  <th className="pb-2 pr-3 font-medium">Culpa</th>
                  <th className="pb-2 pr-3 font-medium">Lim. bodega</th>
                  <th className="pb-2 pr-3 font-medium">Entreg. bodega</th>
                  <th className="pb-2 pr-3 font-medium">Lim. cliente</th>
                  <th className="pb-2 pr-3 font-medium">Entreg. cliente</th>
                  <th className="pb-2 pr-3 font-medium">Retraso</th>
                  <th className="pb-2 font-medium">Tickets</th>
                </tr>
              </thead>
              <tbody>
                {day.orders.map((order) => {
                  const hrs = Math.round(order.days_delayed * 24);
                  const method = order.raw_data ? getShippingMethod(order.source, order.raw_data) : "";
                  const isCE = method === "Regular/Centro Envíos";
                  const isShopify = (order.source || "").startsWith("shopify");
                  const hasClientDeadline = !isCE || isShopify;
                  const wDates = isShopify ? getWeliveryDates(order) : { depot_at: null, delivered_at: null };
                  const entregaBodega = (isShopify && wDates.depot_at) ? wDates.depot_at : (order.handoff_at || order.delivered_at || null);
                  const entregaCliente = hasClientDeadline
                    ? ((isShopify && wDates.delivered_at) ? wDates.delivered_at : (order.delivered_at || null))
                    : null;
                  const createdAt = getCreatedAt(order.raw_data);
                  const isActive = !!(order as HistoricalOrder & { _active?: boolean })._active;
                  return (
                    <tr
                      key={order.id}
                      className={`border-b cursor-pointer transition-colors ${
                        isActive
                          ? "border-l-2 border-l-amber-400 border-b-amber-100 bg-amber-50/40 hover:bg-amber-100/60"
                          : "border-red-100 hover:bg-red-100/60"
                      }`}
                      onClick={() => setSelectedOrder(toDetail(order, isShopify ? wDates : undefined))}
                    >
                      <td className="py-2 pr-3 font-mono text-gray-700">
                        <span className="flex items-center gap-1.5">
                          {getOrderNumber(order.raw_data, order.external_id)}
                          {(() => {
                            const bultos = getBultoCount(order.raw_data);
                            return bultos > 1 ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600">
                                {bultos} bultos
                              </span>
                            ) : null;
                          })()}
                          {isActive && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-200 text-amber-800">
                              Activo
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-gray-600">
                        {SOURCE_LABEL[order.source] || order.source}
                      </td>
                      <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">
                        {createdAt ? formatDeadline(createdAt) : "—"}
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
                        {hasClientDeadline ? formatDeadline(order.limit_delivery_date) : <span className="text-gray-300">N/A</span>}
                      </td>
                      <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">
                        {hasClientDeadline ? formatDeadline(entregaCliente) : <span className="text-gray-300">N/A</span>}
                      </td>
                      <td className="py-2 pr-3 text-red-600 font-medium whitespace-nowrap">
                        +{formatDelayLabel(hrs)}
                      </td>
                      <td className="py-2 whitespace-nowrap">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedOrder(toDetail(order, isShopify ? wDates : undefined)); }}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                            (order.cases?.length ?? 0) > 0
                              ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {(order.cases?.length ?? 0) > 0
                            ? `${order.cases!.length} ticket${order.cases!.length !== 1 ? "s" : ""}`
                            : "+ ticket"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedOrder && (
        <OrderDetailModal detail={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

function MonthSelector({ currentMonth }: { currentMonth?: string }) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const url = new URL(window.location.href);
    if (val) {
      url.searchParams.set("a_month", val);
    } else {
      url.searchParams.delete("a_month");
    }
    url.searchParams.set("tab", "atrasados");
    window.location.href = url.toString();
  };

  const handleClear = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("a_month");
    url.searchParams.set("tab", "atrasados");
    window.location.href = url.toString();
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="month"
        value={currentMonth || ""}
        onChange={handleChange}
        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-black bg-white text-black cursor-pointer"
      />
      {currentMonth && (
        <button
          onClick={handleClear}
          className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-2 py-1.5"
        >
          Últimos 30 días
        </button>
      )}
    </div>
  );
}

export function DailyDelaysSummary({ data, currentMonth }: Props) {
  const totalOrders = data.total;
  const totalPkgs = data.days.reduce(
    (sum, day) => sum + day.orders.reduce((s, o) => s + getBultoCount(o.raw_data), 0),
    0
  );
  const showTotalPkgs = totalPkgs > totalOrders;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-medium text-gray-900">
            Pedidos Atrasados por Día ({totalOrders} orden{totalOrders !== 1 ? "es" : ""}{showTotalPkgs ? `, ${totalPkgs} paquetes` : ""})
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Pedidos atrasados agrupados por fecha de deadline.{" "}
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm bg-amber-300" /> Activos (aún pendientes)
              <span className="inline-block w-2 h-2 rounded-sm bg-red-200 ml-2" /> Históricos (ya resueltos)
            </span>
          </p>
        </div>
        <MonthSelector currentMonth={currentMonth} />
      </div>
      <div className="px-6 py-4 space-y-3">
        {data.days.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No hay pedidos atrasados en este período</p>
        ) : (
          data.days.map((day) => (
            <DaySection key={day.date} day={day} />
          ))
        )}
      </div>
    </div>
  );
}
