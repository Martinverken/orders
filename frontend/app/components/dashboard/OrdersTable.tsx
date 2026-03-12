"use client";

import { useState, useMemo } from "react";
import { Order, OrderCase, Perspective } from "@/app/types";
import { UrgencyBadge, StatusBadge } from "@/app/components/ui/Badge";
import { ProductCell } from "@/app/components/ui/ProductCell";
import { formatDate, formatDeadline, SOURCE_LABEL, getCarrier, getOrderNumber, getTrackingCode, getTrackingUrl, getProductDetails, getShippingDestination, getShippingMethod, getOperator, getBultoCount } from "@/app/lib/utils";
import { getActiveOrderCases, addActiveOrderCase } from "@/app/lib/api";
import { CaseHistoryModal } from "./CaseHistoryModal";

interface Props {
  orders: Order[];
  orderIdsWithCases?: string[];
  perspective?: Perspective;
}

type SortCol = "created_at_source" | "limit_delivery_date" | "synced_at";
type SortDir = "asc" | "desc";

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

function ActiveTicketButton({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);
  const [cases, setCases] = useState<OrderCase[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    if (!cases) {
      setLoading(true);
      try {
        const fetched = await getActiveOrderCases(order.id);
        setCases(fetched);
      } catch {
        setCases([]);
      } finally {
        setLoading(false);
      }
    }
    setOpen(true);
  };

  const handleAdd = async (data: { case_number?: string | null; case_status?: string | null; comments?: string | null }) => {
    const created = await addActiveOrderCase(order.id, data);
    setCases((prev) => [...(prev ?? []), created]);
    return created;
  };

  const count = cases?.length ?? 0;
  const topStatus = cases?.find((c) => c.case_status === "pending")?.case_status
    ?? cases?.find((c) => c.case_status === "created")?.case_status
    ?? cases?.[0]?.case_status;

  const orderNumber = getOrderNumber(order.raw_data, order.external_id);

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={loading}
        className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-full px-2.5 py-1 hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <span className="text-gray-400">...</span>
        ) : (
          <>
            {count > 0 && topStatus && (
              <span className={`inline-block w-2 h-2 rounded-full ${topStatus === "pending" ? "bg-amber-400" : topStatus === "created" ? "bg-blue-400" : "bg-green-400"}`} />
            )}
            <span className="text-gray-600">{count > 0 ? `${count} ticket${count > 1 ? "s" : ""}` : "+ Ticket"}</span>
          </>
        )}
      </button>
      {open && cases !== null && (
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

export function OrdersTable({ orders, orderIdsWithCases = [], perspective = "bodega" }: Props) {
  const caseSet = useMemo(() => new Set(orderIdsWithCases), [orderIdsWithCases]);
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
      const av = a[sortCol] ? new Date(a[sortCol] as string).getTime() : 0;
      const bv = b[sortCol] ? new Date(b[sortCol] as string).getTime() : 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [orders, sortCol, sortDir]);

  if (!orders.length) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="text-4xl mb-3">📭</div>
        <p>No hay pedidos con estos filtros</p>
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
            <th className="pb-3 pr-4 font-medium">Urgencia</th>
            <SortableHeader label="Fecha orden" col="created_at_source" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
            <th className="pb-3 pr-4 font-medium">Límite bodega</th>
            <th className="pb-3 pr-4 font-medium">Entrega bodega</th>
            <SortableHeader label="Límite cliente" col="limit_delivery_date" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
            <th className="pb-3 pr-4 font-medium">Tracking</th>
            <th className="pb-3 pr-4 font-medium">Ciudad</th>
            <th className="pb-3 pr-4 font-medium">Comuna</th>
            <SortableHeader label="Sync" col="synced_at" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
            <th className="pb-3 font-medium">Tickets</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((order, idx) => {
            const shippingMethod = getShippingMethod(order.source, order.raw_data);
            const operator = getOperator(order.source, order.raw_data);
            const orderNumber = getOrderNumber(order.raw_data, order.external_id);
            const tracking = getTrackingCode(order.raw_data);
            const trackingUrl = getTrackingUrl(order.raw_data, tracking);
            const product = getProductDetails(order.raw_data, order.product_name, order.product_quantity);
            const destination = getShippingDestination(order.raw_data);
            return (
              <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className={`py-3 pr-4 text-xs font-medium ${caseSet.has(order.id) ? "text-amber-600 bg-amber-50 rounded" : "text-gray-400"}`}>{idx + 1}</td>
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
                <td className="py-3 pr-4 max-w-[160px]">
                  <ProductCell sku={product.sku} title={product.title} quantity={product.quantity} />
                </td>
                <td className="py-3 pr-4 text-gray-600">
                  {SOURCE_LABEL[order.source] || order.source}
                </td>
                <td className="py-3 pr-4 text-gray-500 text-xs">
                  {shippingMethod}
                </td>
                <td className="py-3 pr-4 text-gray-500 text-xs">
                  {operator || "—"}
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge status={order.status} />
                </td>
                <td className="py-3 pr-4">
                  {order.urgency === "overdue" ? (() => {
                    // Regular/CE: blame always bodega (shipped = terminal, seller only controls handoff)
                    const isRegular = shippingMethod === "Regular/Centro Envíos";
                    const isBodega = isRegular || order.status === "pending" || order.status === "ready_to_ship";
                    return (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        isBodega
                          ? "bg-orange-100 text-orange-700 border-orange-200"
                          : "bg-purple-100 text-purple-700 border-purple-200"
                      }`}>
                        {isBodega ? "Atrasado Bodega" : "Atrasado Transportista"}
                      </span>
                    );
                  })() : (
                    <UrgencyBadge urgency={order.urgency} />
                  )}
                </td>
                <td className="py-3 pr-4 text-gray-500 whitespace-nowrap text-sm">
                  {formatDeadline(order.created_at_source ?? null)}
                </td>
                <td className="py-3 pr-4 text-gray-600 whitespace-nowrap text-sm">
                  {formatDeadline(order.limit_handoff_date || order.limit_delivery_date, order.source)}
                </td>
                <td className="py-3 pr-4 text-gray-600 whitespace-nowrap text-sm">
                  {perspective === "cliente" && order.first_shipped_at
                    ? formatDeadline(order.first_shipped_at)
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="py-3 pr-4 text-gray-600 whitespace-nowrap text-sm">
                  {(() => {
                    const isClientDelivery = shippingMethod === "Direct/Flex" || shippingMethod === "Express" || order.source.startsWith("shopify");
                    return isClientDelivery
                      ? formatDeadline(order.limit_delivery_date, order.source)
                      : <span className="text-gray-400">—</span>;
                  })()}
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
                <td className="py-3 pr-4 text-gray-400 text-xs whitespace-nowrap">
                  {formatDate(order.synced_at)}
                </td>
                <td className="py-3 pr-2">
                  <ActiveTicketButton order={order} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
