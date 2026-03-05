"use client";

import { useState } from "react";
import { HistoricalOrder, OrderCase } from "@/app/types";
import { SOURCE_LABEL, getCarrier, getOrderNumber } from "@/app/lib/utils";
import { addOrderCase } from "@/app/lib/api";
import { CaseHistoryModal } from "./CaseHistoryModal";

interface Props {
  orders: HistoricalOrder[];
}

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

const CASE_STATUS_LABEL: Record<string, string> = {
  created: "Creado",
  pending: "Pendiente",
  resolved: "Resuelto",
};

function TicketRow({ order }: { order: HistoricalOrder }) {
  const [cases, setCases] = useState<OrderCase[]>(order.cases ?? []);
  const [open, setOpen] = useState(false);

  const carrier = getCarrier(order.raw_data);
  const orderNumber = getOrderNumber(order.raw_data, order.external_id);
  const isDelayed = order.days_delayed > 0;

  const handleAdd = async (data: { case_number?: string | null; case_status?: string | null; comments?: string | null }) => {
    const created = await addOrderCase(order.id, data);
    setCases((prev) => [...prev, created]);
    return created;
  };

  // Top status for summary badge
  const topStatus = cases.find((c) => c.case_status === "pending")?.case_status
    ?? cases.find((c) => c.case_status === "created")?.case_status
    ?? cases[0]?.case_status;

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors align-middle">
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
        <td className="py-3 pr-4">
          {/* Compact case status badges */}
          <div className="flex flex-wrap gap-1">
            {cases.map((c) => (
              <span key={c.id} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CASE_STATUS_STYLE[c.case_status ?? ""] ?? "bg-gray-100 text-gray-600"}`}>
                {c.case_number || CASE_STATUS_LABEL[c.case_status ?? ""] || "—"}
              </span>
            ))}
          </div>
        </td>
        <td className="py-3 pr-2">
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-full px-2.5 py-1 hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            {topStatus && (
              <span className={`inline-block w-2 h-2 rounded-full ${topStatus === "pending" ? "bg-amber-400" : topStatus === "created" ? "bg-blue-400" : "bg-green-400"}`} />
            )}
            <span className="text-gray-600">Ver {cases.length} ticket{cases.length !== 1 ? "s" : ""}</span>
          </button>
        </td>
      </tr>
      {open && (
        <CaseHistoryModal
          orderLabel={orderNumber}
          initialCases={cases}
          onClose={() => setOpen(false)}
          onAddCase={handleAdd}
        />
      )}
    </>
  );
}

export function TicketsTable({ orders }: Props) {
  const sorted = [...orders].sort((a, b) => {
    const aMin = Math.min(...(a.cases ?? []).map((c) => CASE_STATUS_ORDER[c.case_status ?? ""] ?? 99));
    const bMin = Math.min(...(b.cases ?? []).map((c) => CASE_STATUS_ORDER[c.case_status ?? ""] ?? 99));
    return (isFinite(aMin) ? aMin : 99) - (isFinite(bMin) ? bMin : 99);
  });

  if (!sorted.length) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="text-4xl mb-3">🎫</div>
        <p>No hay tickets creados aún.</p>
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
            <th className="pb-3 pr-4 font-medium">Estado tickets</th>
            <th className="pb-3 font-medium">Detalle</th>
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
