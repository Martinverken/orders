import { HistoricalOrder } from "@/app/types";
import { SOURCE_LABEL, formatDeadline, getCarrier, getOrderNumber, getProductDetails, getShippingDestination, getTrackingCode, getTrackingUrl } from "@/app/lib/utils";

interface Props {
  orders: HistoricalOrder[];
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
            <th className="pb-3 pr-4 font-medium">Resultado</th>
            <th className="pb-3 pr-4 font-medium">Fecha límite</th>
            <th className="pb-3 pr-4 font-medium">Fecha entrega</th>
            <th className="pb-3 pr-4 font-medium">Días retraso</th>
            <th className="pb-3 pr-4 font-medium">Operador logístico</th>
            <th className="pb-3 pr-4 font-medium">Tracking</th>
            <th className="pb-3 pr-4 font-medium">Ciudad</th>
            <th className="pb-3 font-medium">Comuna</th>
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
                  <HistoricalUrgencyBadge daysDelayed={order.days_delayed} />
                </td>
                <td className="py-3 pr-4 text-gray-600 whitespace-nowrap text-sm">
                  {formatDeadline(order.limit_delivery_date)}
                </td>
                <td className="py-3 pr-4 text-gray-600 whitespace-nowrap text-sm">
                  {order.delivered_at ? formatDeadline(order.delivered_at) : "—"}
                </td>
                <td className="py-3 pr-4 text-sm whitespace-nowrap">
                  {isDelayed ? (
                    <span className="text-red-600 font-medium">+{order.days_delayed.toFixed(1)}d</span>
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
                <td className="py-3 text-gray-600 text-xs capitalize">
                  {destination.comuna?.toLowerCase() || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
