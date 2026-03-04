"use client";

import { useState } from "react";
import { HistoricalOrder } from "@/app/types";
import { SOURCE_LABEL, getCarrier, getOrderNumber } from "@/app/lib/utils";
import { updateHistoricalOrderCase } from "@/app/lib/api";

interface Props {
  orders: HistoricalOrder[];
  onUpdated?: () => void;
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

const inputClass =
  "text-xs border border-black rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-black bg-white text-black placeholder-gray-400";

function TicketRow({ order, onUpdated }: { order: HistoricalOrder; onUpdated?: () => void }) {
  const [caseNumber, setCaseNumber] = useState(order.case_number ?? "");
  const [comments, setComments] = useState(order.comments ?? "");
  const [caseStatus, setCaseStatus] = useState(order.case_status ?? "");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"ok" | "error" | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      await updateHistoricalOrderCase(
        order.id,
        caseNumber.trim() || null,
        comments.trim() || null,
        caseStatus || null,
      );
      setSaveResult("ok");
      setTimeout(() => {
        setSaveResult(null);
        onUpdated?.();
      }, 1500);
    } catch {
      setSaveResult("error");
      setTimeout(() => setSaveResult(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  const carrier = getCarrier(order.raw_data);
  const orderNumber = getOrderNumber(order.raw_data, order.external_id);
  const isDelayed = order.days_delayed > 0;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="py-3 pr-4 font-mono text-gray-700 text-xs">{orderNumber}</td>
      <td className="py-3 pr-4 text-gray-600 text-xs">{SOURCE_LABEL[order.source] || order.source}</td>
      <td className="py-3 pr-4 text-gray-500 text-xs">{carrier || order.logistics_operator || "—"}</td>
      <td className="py-3 pr-4 text-sm whitespace-nowrap">
        {isDelayed ? (
          <span className="text-red-600 font-medium">
            +{Math.round(order.days_delayed * 24)} hrs
          </span>
        ) : (
          <span className="text-gray-400">A tiempo</span>
        )}
      </td>
      <td className="py-3 pr-4">
        {caseStatus && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CASE_STATUS_STYLE[caseStatus] ?? "bg-gray-100 text-gray-600"}`}>
            {CASE_STATUS_OPTIONS.find((o) => o.value === caseStatus)?.label ?? caseStatus}
          </span>
        )}
      </td>
      <td className="py-3 pr-4 text-gray-500 text-xs font-mono">{caseNumber || "—"}</td>
      <td className="py-3 pr-4 text-gray-500 text-xs max-w-[200px] truncate">{comments || "—"}</td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={caseStatus}
            onChange={(e) => setCaseStatus(e.target.value)}
            className={`text-xs border border-black rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-black cursor-pointer text-black bg-white ${caseStatus ? CASE_STATUS_STYLE[caseStatus] : ""}`}
          >
            {CASE_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={caseNumber}
            placeholder="N° caso"
            maxLength={80}
            onChange={(e) => setCaseNumber(e.target.value)}
            className={`w-24 ${inputClass}`}
          />
          <input
            type="text"
            value={comments}
            placeholder="Comentarios"
            maxLength={300}
            onChange={(e) => setComments(e.target.value)}
            className={`w-44 ${inputClass}`}
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs bg-black text-white rounded px-2 py-1 hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? "..." : "Guardar"}
          </button>
          {saveResult === "ok" && <span className="text-xs text-green-600 font-medium">✓ Guardado</span>}
          {saveResult === "error" && <span className="text-xs text-red-600 font-medium">Error al guardar</span>}
        </div>
      </td>
    </tr>
  );
}

export function TicketsTable({ orders, onUpdated }: Props) {
  const sorted = [...orders].sort(
    (a, b) =>
      (CASE_STATUS_ORDER[a.case_status ?? ""] ?? 99) -
      (CASE_STATUS_ORDER[b.case_status ?? ""] ?? 99),
  );

  if (!sorted.length) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="text-4xl mb-3">🎫</div>
        <p>No hay tickets creados aún</p>
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
            <th className="pb-3 pr-4 font-medium">Estado ticket</th>
            <th className="pb-3 pr-4 font-medium">N° Caso</th>
            <th className="pb-3 pr-4 font-medium">Comentarios</th>
            <th className="pb-3 font-medium">Editar</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((order) => (
            <TicketRow key={order.id} order={order} onUpdated={onUpdated} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
