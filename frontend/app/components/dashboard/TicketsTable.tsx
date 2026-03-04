"use client";

import { useState } from "react";
import { HistoricalOrder, OrderCase } from "@/app/types";
import { SOURCE_LABEL, getCarrier, getOrderNumber } from "@/app/lib/utils";
import { addOrderCase, deleteOrderCase } from "@/app/lib/api";

interface Props {
  orders: HistoricalOrder[];
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

const CASE_STATUS_ORDER: Record<string, number> = {
  pending: 0,
  created: 1,
  resolved: 2,
};

const inputClass = "text-xs border border-black rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-black bg-white text-black placeholder-gray-400";

function TicketRow({ order }: { order: HistoricalOrder }) {
  const [cases, setCases] = useState<OrderCase[]>(order.cases ?? []);
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
      const created = await addOrderCase(order.id, {
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

  const carrier = getCarrier(order.raw_data);
  const orderNumber = getOrderNumber(order.raw_data, order.external_id);
  const isDelayed = order.days_delayed > 0;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors align-top">
      <td className="py-3 pr-4 font-mono text-gray-700 text-xs">{orderNumber}</td>
      <td className="py-3 pr-4 text-gray-600 text-xs">{SOURCE_LABEL[order.source] || order.source}</td>
      <td className="py-3 pr-4 text-gray-500 text-xs">{carrier || order.logistics_operator || "—"}</td>
      <td className="py-3 pr-4 text-sm whitespace-nowrap">
        {isDelayed ? (
          <span className="text-red-600 font-medium">+{Math.round(order.days_delayed * 24)} hrs</span>
        ) : (
          <span className="text-gray-400">A tiempo</span>
        )}
      </td>
      <td className="py-3 pr-2 min-w-[320px]">
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
                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
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
                className={`text-xs border border-black rounded px-2 py-1 focus:outline-none cursor-pointer text-black bg-white ${newStatus ? CASE_STATUS_STYLE[newStatus] : ""}`}
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
              {saveResult === "error" && <span className="text-xs text-red-600 font-medium">Error</span>}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAdding(true)}
                className="text-xs border border-black text-black rounded px-2 py-1 hover:bg-gray-100 whitespace-nowrap"
              >
                + Agregar ticket
              </button>
              {saveResult === "ok" && <span className="text-xs text-green-600 font-medium">✓</span>}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

export function TicketsTable({ orders }: Props) {
  const sorted = [...orders].sort(
    (a, b) => {
      const aMin = Math.min(...(a.cases ?? []).map((c) => CASE_STATUS_ORDER[c.case_status ?? ""] ?? 99));
      const bMin = Math.min(...(b.cases ?? []).map((c) => CASE_STATUS_ORDER[c.case_status ?? ""] ?? 99));
      return (isFinite(aMin) ? aMin : 99) - (isFinite(bMin) ? bMin : 99);
    },
  );

  if (!sorted.length) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="text-4xl mb-3">🎫</div>
        <p>No hay tickets creados aún. Agrega tickets desde la pestaña Historial.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wide">
            <th className="pb-3 pr-4 font-medium">Order N°</th>
            <th className="pb-3 pr-4 font-medium">Fuente</th>
            <th className="pb-3 pr-4 font-medium">Operador</th>
            <th className="pb-3 pr-4 font-medium">Retraso</th>
            <th className="pb-3 font-medium">Tickets</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((order) => (
            <TicketRow key={order.id} order={order} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
