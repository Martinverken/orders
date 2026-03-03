import { OrderUrgency } from "@/app/types";

export function formatDate(isoString: string | null): string {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  });
}

/** Muestra la fecha exactamente como está guardada en la BD, sin conversión de zona horaria. */
export function formatDateRaw(isoString: string | null): string {
  if (!isoString) return "—";
  // Extrae YYYY-MM-DD HH:MM directamente del string sin convertir timezone
  const s = isoString.replace("T", " ").substring(0, 16);
  const [date, time] = s.split(" ");
  if (!date) return isoString;
  const [year, month, day] = date.split("-");
  return time ? `${day}/${month}/${year} ${time}` : `${day}/${month}/${year}`;
}

export function formatRelative(isoString: string | null): string {
  if (!isoString) return "Nunca";
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Hace un momento";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days}d`;
}

export const URGENCY_LABEL: Record<OrderUrgency, string> = {
  overdue: "Atrasado",
  due_today: "Entregar hoy",
  delivered_today: "Entregado hoy",
  tomorrow: "Mañana",
  on_time: "A tiempo",
};

export const URGENCY_CLASSES: Record<OrderUrgency, string> = {
  overdue: "bg-red-100 text-red-700 border-red-200",
  due_today: "bg-amber-100 text-amber-700 border-amber-200",
  delivered_today: "bg-green-100 text-green-700 border-green-200",
  tomorrow: "bg-blue-100 text-blue-700 border-blue-200",
  on_time: "bg-gray-100 text-gray-600 border-gray-200",
};

export const SOURCE_LABEL: Record<string, string> = {
  falabella: "Falabella",
  mercadolibre: "Mercado Libre",
};

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  ready_to_ship: "Listo para enviar",
  shipped: "Entregado",
};

export const STATUS_CLASSES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  ready_to_ship: "bg-blue-100 text-blue-700 border-blue-200",
  shipped: "bg-green-100 text-green-700 border-green-200",
};

// Tipo de envío / operador logístico desde raw_data de Falabella
// Falabella devuelve DeliveryInfo y/o ShippingProvider en cada orden
const CARRIER_LABEL: Record<string, string> = {
  blueexpress: "Blue Express",
  blue_express: "Blue Express",
  "blue express": "Blue Express",
  falaflex: "Falaflex",
  chilexpress: "Chilexpress",
};

const SHIPPING_PROVIDER_TYPE_LABEL: Record<string, string> = {
  dropshipping: "Despacho directo",
  crossdocking: "FalaFlex",
  falaflex: "FalaFlex",
  "3pl": "Operador 3PL",
};

export function getCarrier(raw_data?: Record<string, unknown>): string {
  if (!raw_data) return "";

  // 1. ShippingProvider (nombre del operador, viene de GetOrderItems)
  if (raw_data.ShippingProvider) return String(raw_data.ShippingProvider);

  // 2. ShippingProviderType (tipo: dropshipping, crossdocking, etc.)
  const spt = ((raw_data.ShippingProviderType as string) || "").toLowerCase();
  if (spt) return SHIPPING_PROVIDER_TYPE_LABEL[spt] ?? spt;

  // 3. DeliveryInfo como fallback
  const deliveryInfo = raw_data.DeliveryInfo;
  if (deliveryInfo) {
    if (typeof deliveryInfo === "string") {
      try {
        const parsed = JSON.parse(deliveryInfo);
        const inner = parsed.ShippingProvider || parsed.LogisticsProvider || parsed.DeliveryType || "";
        if (inner) return String(inner);
      } catch {
        return deliveryInfo;
      }
    } else if (typeof deliveryInfo === "object") {
      const obj = deliveryInfo as Record<string, unknown>;
      return String(obj.ShippingProvider || obj.LogisticsProvider || obj.DeliveryType || "");
    }
  }

  // 4. Otros campos
  const providerRaw = ((raw_data.LogisticsProviderName as string) || "").toLowerCase();
  return CARRIER_LABEL[providerRaw] ?? (providerRaw || "");
}

export function getOrderNumber(raw_data?: Record<string, unknown>, fallback?: string): string {
  if (raw_data?.OrderNumber) return String(raw_data.OrderNumber);
  return fallback ?? "";
}

export function getTrackingCode(raw_data?: Record<string, unknown>): string {
  if (!raw_data) return "";
  return (
    (raw_data.TrackingCode as string) ||
    (raw_data.tracking_code as string) ||
    (raw_data.TrackingNumber as string) ||
    (raw_data.ShipmentId as string) ||
    ""
  );
}
