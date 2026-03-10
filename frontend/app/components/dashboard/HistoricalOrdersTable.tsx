"use client";

import { useState, useMemo } from "react";
import { HistoricalOrder, OrderCase } from "@/app/types";
import { ProductCell } from "@/app/components/ui/ProductCell";
import { SOURCE_LABEL, formatDeadline, getCarrier, getCreatedAt, getOrderNumber, getProductDetails, getShippingDestination, getTrackingCode, getTrackingUrl, getShippingMethod, getOperator } from "@/app/lib/utils";
import { addOrderCase } from "@/app/lib/api";
import { CaseHistoryModal } from "./CaseHistoryModal";

interface Props {
  orders: HistoricalOrder[];
}

type SortCol = "created_at" | "limit_delivery_date" | "delivered_at" | "days_delayed";
type SortDir = "asc" | "desc";

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

function HistoricalUrgencyBadge({ daysDelayed, blame }: { daysDelayed: number; blame?: string | null }) {
  if (daysDelayed > 0) {
    const label = blame === "bodega"
      ? "Atrasado (Bodega)"
      : blame === "transportista"
      ? "Atrasado (Transportista)"
      : "Atrasado";
    const color = blame === "bodega"
      ? "bg-orange-100 text-orange-700"
      : blame === "transportista"
      ? "bg-purple-100 text-purple-700"
      : "bg-red-100 text-red-700";
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
      A tiempo
    </span>
  );
}

function SortableHeader({
  label,
  col,
  sortCol,
  sortDir,
  onSort,
}: {
  label: string;
  col: SortCol;
  sortCol: SortCol | null;
  sortDir: SortDir;
  onSort: (col: SortCol) => void;
}) {
  const active = sortCol === col;
  return (
    <th
      className="pb-3 pr-4 font-medium cursor-pointer select-none hover:text-gray-700 whitespace-nowrap"
      onClick={() => onSort(col)}
    >
      {label}
      <span className="ml-1 inline-block w-3 text-center">
        {active ? (sortDir === "asc" ? "↑" : "↓") : <span className="opacity-30">↕</span>}
      </span>
    </th>
  );
}

function TicketButton({ orderId, orderLabel, initialCases }: { orderId: string; orderLabel: string; initialCases: OrderCase[] }) {
  const [open, setOpen] = useState(false);
  const [cases, setCases] = useState<OrderCase[]>(initialCases);

  const handleAdd = async (data: { case_number?: string | null; case_status?: string | null; comments?: string | null }) => {
    const created = await addOrderCase(orderId, data);
    setCases((prev) => [...prev, created]);
    return created;
  };

  // Highest-priority case status for badge
  const topStatus = cases.find((c) => c.case_status === "pending")?.case_status
    ?? cases.find((c) => c.case_status === "created")?.case_status
    ?? cases[0]?.case_status;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-full px-2.5 py-1 hover:bg-gray-50 transition-colors"
      >
        {cases.length > 0 && topStatus && (
          <span className={`inline-block w-2 h-2 rounded-full ${topStatus === "pending" ? "bg-amber-400" : topStatus === "created" ? "bg-blue-400" : "bg-green-400"}`} />
        )}
        <span className="text-gray-600">
          {cases.length > 0 ? `${cases.length} ticket${cases.length > 1 ? "s" : ""}` : "+ Ticket"}
        </span>
      </button>
      {open && (
        <CaseHistoryModal
          orderLabel={orderLabel}
          initialCases={cases}
          onClose={() => setOpen(false)}
          onAddCase={handleAdd}
        />
      )}
    </>
  );
}

function OrderRow({ order, idx }: { order: HistoricalOrder; idx: number }) {
  const shippingMethod = getShippingMethod(order.source, order.raw_data);
  const operator = getOperator(order.source, order.raw_data);
  const orderNumber = getOrderNumber(order.raw_data, order.external_id);
  const tracking = getTrackingCode(order.raw_data);
  const trackingUrl = getTrackingUrl(order.raw_data, tracking);
  const product = getProductDetails(order.raw_data, null, null);
  const destination = getShippingDestination(order.raw_data);
  const isDelayed = order.days_delayed > 0;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className={`py-3 pr-4 text-xs font-medium ${(order.cases?.length ?? 0) > 0 ? "text-amber-600 bg-amber-50 rounded" : "text-gray-400"}`}>{idx + 1}</td>
      <td className="py-3 pr-4 font-mono text-gray-700 text-xs">{orderNumber}</td>
      <td className="py-3 pr-4 max-w-[160px]">
        <ProductCell sku={product.sku} title={product.title} quantity={product.quantity} />
      </td>
      <td className="py-3 pr-4 text-gray-600">{SOURCE_LABEL[order.source] || order.source}</td>
      <td className="py-3 pr-4 text-gray-500 text-xs">{shippingMethod}</td>
      <td className="py-3 pr-4 text-gray-500 text-xs">{operator || "—"}</td>
      <td className="py-3 pr-4"><StatusBadge status={order.status} /></td>
      <td className="py-3 pr-4"><HistoricalUrgencyBadge daysDelayed={order.days_delayed} blame={order.blame} /></td>
      <td className="py-3 pr-4 text-gray-600 whitespace-nowrap text-sm">
        {formatDeadline(getCreatedAt(order.raw_data))}
      </td>
      <td className="py-3 pr-4 text-gray-600 whitespace-nowrap text-sm">
        {formatDeadline(order.limit_handoff_date || order.limit_delivery_date)}
      </td>
      <td className="py-3 pr-4 text-gray-600 whitespace-nowrap text-sm">
        {order.handoff_at ? formatDeadline(order.handoff_at) : "—"}
      </td>
      <td className="py-3 pr-4 text-gray-600 whitespace-nowrap text-sm">
        {(() => {
          const isClientDelivery = shippingMethod === "Direct/Flex" || shippingMethod === "Express" || order.source.startsWith("shopify");
          return isClientDelivery ? formatDeadline(order.limit_delivery_date) : <span className="text-gray-400">—</span>;
        })()}
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
      <td className="py-3 pr-2">
        <TicketButton
          orderId={order.id}
          orderLabel={orderNumber}
          initialCases={order.cases ?? []}
        />
      </td>
    </tr>
  );
}

export function HistoricalOrdersTable({ orders }: Props) {
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const sorted = useMemo(() => {
    if (!sortCol) return orders;
    return [...orders].sort((a, b) => {
      let av: number;
      let bv: number;
      if (sortCol === "days_delayed") {
        av = a.days_delayed ?? 0;
        bv = b.days_delayed ?? 0;
      } else if (sortCol === "created_at") {
        av = getCreatedAt(a.raw_data) ? new Date(getCreatedAt(a.raw_data)!).getTime() : 0;
        bv = getCreatedAt(b.raw_data) ? new Date(getCreatedAt(b.raw_data)!).getTime() : 0;
      } else {
        const aVal = a[sortCol as keyof HistoricalOrder];
        const bVal = b[sortCol as keyof HistoricalOrder];
        av = aVal ? new Date(aVal as string).getTime() : 0;
        bv = bVal ? new Date(bVal as string).getTime() : 0;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [orders, sortCol, sortDir]);

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
            <th className="pb-3 pr-4 font-medium">Método envío</th>
            <th className="pb-3 pr-4 font-medium">Operador</th>
            <th className="pb-3 pr-4 font-medium">Estado</th>
            <th className="pb-3 pr-4 font-medium">Resultado</th>
            <SortableHeader label="Fecha Orden" col="created_at" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
            <th className="pb-3 pr-4 font-medium">Límite bodega</th>
            <th className="pb-3 pr-4 font-medium">Entrega bodega</th>
            <SortableHeader label="Límite cliente" col="limit_delivery_date" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Entrega cliente" col="delivered_at" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Retraso" col="days_delayed" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
            <th className="pb-3 pr-4 font-medium">Tracking</th>
            <th className="pb-3 pr-4 font-medium">Ciudad</th>
            <th className="pb-3 pr-4 font-medium">Comuna</th>
            <th className="pb-3 pr-4 font-medium">Comprobante</th>
            <th className="pb-3 font-medium">Tickets</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((order, idx) => (
            <OrderRow key={order.id} order={order} idx={idx} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
