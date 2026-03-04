"use client";

import { useState } from "react";
import { HistoricalOrder, OrderCase } from "@/app/types";
import { SOURCE_LABEL, formatDeadline, getCarrier, getCreatedAt, getOrderNumber, getProductDetails, getShippingDestination, getTrackingCode, getTrackingUrl } from "@/app/lib/utils";
import { addOrderCase, deleteOrderCase } from "@/app/lib/api";

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

const inputClass = "text-xs border border-black rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-black bg-white text-black placeholder-gray-400";

function CasesSection({ orderId, initialCases }: { orderId: string; initialCases: OrderCase[] }) {
  const [cases, setCases] = useState<OrderCase[]>(initialCases);
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
      const created = await addOrderCase(orderId, {
        case_status: newStatus || null,
        case_number: newNumber.trim() || null,
        comments: newComment.trim() || null,
      });
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

  return (
    <div className="space-y-1.5">
      {cases.map((c) => (
        <div key={c.id} className="flex items-center gap-2 flex-wrap">
          {c.case_status && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CASE_STATUS_STYLE[c.case_status] ?? "bg-gray-100 text-gray-600"}`}>
              {CASE_STATUS_OPTIONS.find((o) => o.value === c.case_status)?.label ?? c.case_status}
            </span>
          )}
          {c.case_number && <span className="font-mono text-xs text-gray-700">{c.case_number}</span>}
          {c.comments && <span className="text-xs text-gray-500 max-w-[200px] truncate" title={c.comments}>{c.comments}</span>}
          <button
            onClick={() => handleDelete(c.id)}
            disabled={deletingId === c.id}
            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40 ml-auto"
            title="Eliminar"
          >
            ✕
          </button>
        </div>
      ))}

      {adding ? (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            className={`text-xs border border-black rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-black cursor-pointer text-black bg-white ${newStatus ? CASE_STATUS_STYLE[newStatus] : ""}`}
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
            className={`w-24 ${inputClass}`}
          />
          <input
            type="text"
            value={newComment}
            placeholder="Comentario"
            maxLength={300}
            onChange={(e) => setNewComment(e.target.value)}
            className={`w-44 ${inputClass}`}
          />
          <button
            onClick={handleAdd}
            disabled={saving}
            className="text-xs bg-black text-white rounded px-2 py-1 hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? "..." : "Guardar"}
          </button>
          <button
            onClick={() => { setAdding(false); setNewStatus(""); setNewNumber(""); setNewComment(""); }}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Cancelar
          </button>
          {saveResult === "ok" && <span className="text-xs text-green-600 font-medium">✓ Guardado</span>}
          {saveResult === "error" && <span className="text-xs text-red-600 font-medium">Error al guardar</span>}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAdding(true)}
            className="text-xs border border-black text-black rounded px-2 py-1 hover:bg-gray-100 whitespace-nowrap"
          >
            + Agregar ticket
          </button>
          {saveResult === "ok" && <span className="text-xs text-green-600 font-medium">✓ Guardado</span>}
        </div>
      )}
    </div>
  );
}

function OrderRow({ order, idx }: { order: HistoricalOrder; idx: number }) {
  const carrier = getCarrier(order.raw_data);
  const orderNumber = getOrderNumber(order.raw_data, order.external_id);
  const tracking = getTrackingCode(order.raw_data);
  const trackingUrl = getTrackingUrl(order.raw_data, tracking);
  const product = getProductDetails(order.raw_data, null, null);
  const destination = getShippingDestination(order.raw_data);
  const isDelayed = order.days_delayed > 0;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
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
      <td className="py-3 pr-4 text-gray-600">{SOURCE_LABEL[order.source] || order.source}</td>
      <td className="py-3 pr-4 text-gray-500 text-xs">{carrier || order.logistics_operator || "—"}</td>
      <td className="py-3 pr-4"><StatusBadge status={order.status} /></td>
      <td className="py-3 pr-4"><HistoricalUrgencyBadge daysDelayed={order.days_delayed} /></td>
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
      <td className="py-3 pr-4 font-mono text-xs text-gray-600">
        {trackingUrl ? (
          <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            {tracking}
          </a>
        ) : (tracking || "—")}
      </td>
      <td className="py-3 pr-4 text-gray-600 text-xs capitalize">{destination.city?.toLowerCase() || "—"}</td>
      <td className="py-3 pr-4 text-gray-600 text-xs capitalize">{destination.comuna?.toLowerCase() || "—"}</td>
      <td className="py-3 pr-4 text-xs">
        {order.comprobante ? (
          <a href={order.comprobante} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline whitespace-nowrap">
            Ver PDF
          </a>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="py-3 pr-2 min-w-[280px]">
        <CasesSection orderId={order.id} initialCases={order.cases ?? []} />
      </td>
    </tr>
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
            <th className="pb-3 pr-4 font-medium">Operador</th>
            <th className="pb-3 pr-4 font-medium">Estado</th>
            <th className="pb-3 pr-4 font-medium">Resultado</th>
            <th className="pb-3 pr-4 font-medium">Fecha Orden</th>
            <th className="pb-3 pr-4 font-medium">Fecha límite</th>
            <th className="pb-3 pr-4 font-medium">Fecha entrega</th>
            <th className="pb-3 pr-4 font-medium">Retraso</th>
            <th className="pb-3 pr-4 font-medium">Tracking</th>
            <th className="pb-3 pr-4 font-medium">Ciudad</th>
            <th className="pb-3 pr-4 font-medium">Comuna</th>
            <th className="pb-3 pr-4 font-medium">Comprobante</th>
            <th className="pb-3 font-medium">Tickets</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order, idx) => (
            <OrderRow key={order.id} order={order} idx={idx} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
