"use client";

import { useState } from "react";
import { ActiveOrderWithCases, HistoricalOrder, OrderCase } from "@/app/types";
import { SOURCE_LABEL, getCarrier, getOrderNumber, URGENCY_LABEL, URGENCY_CLASSES, getBultoCount } from "@/app/lib/utils";
import { addOrderCase, addActiveOrderCase } from "@/app/lib/api";
import { CaseHistoryModal } from "./CaseHistoryModal";

interface Props {
  orders: HistoricalOrder[];
  activeOrders?: ActiveOrderWithCases[];
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

function topCaseStatus(cases: OrderCase[]): string | undefined {
  const s = cases.find((c) => c.case_status === "pending")?.case_status
    ?? cases.find((c) => c.case_status === "created")?.case_status
    ?? cases[0]?.case_status;
  return s ?? undefined;
}

function CaseBadges({ cases }: { cases: OrderCase[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {cases.map((c) => (
        <span key={c.id} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CASE_STATUS_STYLE[c.case_status ?? ""] ?? "bg-gray-100 text-gray-600"}`}>
          {c.case_number || CASE_STATUS_LABEL[c.case_status ?? ""] || "—"}
        </span>
      ))}
    </div>
  );
}

function ViewButton({ cases, onOpen }: { cases: OrderCase[]; onOpen: () => void }) {
  const top = topCaseStatus(cases);
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-full px-2.5 py-1 hover:bg-gray-50 transition-colors whitespace-nowrap"
    >
      {top && (
        <span className={`inline-block w-2 h-2 rounded-full ${top === "pending" ? "bg-amber-400" : top === "created" ? "bg-blue-400" : "bg-green-400"}`} />
      )}
      <span className="text-gray-600">Ver {cases.length} ticket{cases.length !== 1 ? "s" : ""}</span>
    </button>
  );
}

function HistoricalTicketRow({ order }: { order: HistoricalOrder }) {
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

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors align-middle">
        <td className="py-3 pr-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Histórico</span>
        </td>
        <td className="py-3 pr-4 font-mono text-gray-700 text-xs">
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
        <td className="py-3 pr-4 text-gray-600 text-xs">{SOURCE_LABEL[order.source] || order.source}</td>
        <td className="py-3 pr-4 text-gray-500 text-xs">{carrier || order.logistics_operator || "—"}</td>
        <td className="py-3 pr-4 text-sm whitespace-nowrap">
          {isDelayed ? (
            <span className="text-red-600 font-medium">+{Math.round(order.days_delayed * 24)} hrs</span>
          ) : (
            <span className="text-gray-400">A tiempo</span>
          )}
        </td>
        <td className="py-3 pr-4"><CaseBadges cases={cases} /></td>
        <td className="py-3 pr-2">
          <ViewButton cases={cases} onOpen={() => setOpen(true)} />
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

function ActiveTicketRow({ item }: { item: ActiveOrderWithCases }) {
  const [cases, setCases] = useState<OrderCase[]>(item.cases ?? []);
  const [open, setOpen] = useState(false);
  const { order } = item;
  const carrier = getCarrier(order.raw_data);
  const orderNumber = getOrderNumber(order.raw_data, order.external_id);

  const handleAdd = async (data: { case_number?: string | null; case_status?: string | null; comments?: string | null }) => {
    const created = await addActiveOrderCase(order.id, data);
    setCases((prev) => [...prev, created]);
    return created;
  };

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors align-middle">
        <td className="py-3 pr-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600">Activo</span>
        </td>
        <td className="py-3 pr-4 font-mono text-gray-700 text-xs">
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
        <td className="py-3 pr-4 text-gray-600 text-xs">{SOURCE_LABEL[order.source] || order.source}</td>
        <td className="py-3 pr-4 text-gray-500 text-xs">{carrier || "—"}</td>
        <td className="py-3 pr-4">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${URGENCY_CLASSES[order.urgency]}`}>
            {URGENCY_LABEL[order.urgency]}
          </span>
        </td>
        <td className="py-3 pr-4"><CaseBadges cases={cases} /></td>
        <td className="py-3 pr-2">
          <ViewButton cases={cases} onOpen={() => setOpen(true)} />
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

export function TicketsTable({ orders, activeOrders = [] }: Props) {
  const sortedHistorical = [...orders].sort((a, b) => {
    const aMin = Math.min(...(a.cases ?? []).map((c) => CASE_STATUS_ORDER[c.case_status ?? ""] ?? 99));
    const bMin = Math.min(...(b.cases ?? []).map((c) => CASE_STATUS_ORDER[c.case_status ?? ""] ?? 99));
    return (isFinite(aMin) ? aMin : 99) - (isFinite(bMin) ? bMin : 99);
  });

  const sortedActive = [...activeOrders].sort((a, b) => {
    const aMin = Math.min(...a.cases.map((c) => CASE_STATUS_ORDER[c.case_status ?? ""] ?? 99));
    const bMin = Math.min(...b.cases.map((c) => CASE_STATUS_ORDER[c.case_status ?? ""] ?? 99));
    return (isFinite(aMin) ? aMin : 99) - (isFinite(bMin) ? bMin : 99);
  });

  if (!sortedHistorical.length && !sortedActive.length) {
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
            <th className="pb-3 pr-3 font-medium">Tipo</th>
            <th className="pb-3 pr-4 font-medium">Order N°</th>
            <th className="pb-3 pr-4 font-medium">Fuente</th>
            <th className="pb-3 pr-4 font-medium">Operador</th>
            <th className="pb-3 pr-4 font-medium">Estado / Retraso</th>
            <th className="pb-3 pr-4 font-medium">Tickets</th>
            <th className="pb-3 font-medium">Detalle</th>
          </tr>
        </thead>
        <tbody>
          {sortedActive.map((item) => (
            <ActiveTicketRow key={item.order.id} item={item} />
          ))}
          {sortedHistorical.map((order) => (
            <HistoricalTicketRow key={order.id} order={order} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
