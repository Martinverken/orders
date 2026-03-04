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
  // Falabella & ML shared
  pending: "Pendiente",
  ready_to_ship: "Listo para enviar",
  shipped: "En Camino",
  delivered: "Entregado",
  // ML specific
  handling: "Preparando",
  paid: "Pagado",
  not_delivered: "No entregado",
  cancelled: "Cancelado",
};

export const STATUS_CLASSES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  ready_to_ship: "bg-blue-100 text-blue-700 border-blue-200",
  handling: "bg-purple-100 text-purple-700 border-purple-200",
  shipped: "bg-indigo-100 text-indigo-700 border-indigo-200",
  delivered: "bg-green-100 text-green-700 border-green-200",
  paid: "bg-gray-100 text-gray-600 border-gray-200",
  not_delivered: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
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
  crossdocking: "Direct",
  falaflex: "Direct",
  direct: "Direct",
  "3pl": "Operador 3PL",
};

export function getCarrier(raw_data?: Record<string, unknown>): string {
  if (!raw_data) return "";

  // ML: delivery_mode computed by mapper ("Flex" | "Centro de Envíos" | ...)
  if (raw_data.delivery_mode) return String(raw_data.delivery_mode);

  // Falabella: combinar ShippingProviderType + ShippingProvider
  const spt = ((raw_data.ShippingProviderType as string) || "").toLowerCase();
  if (spt === "regular") {
    const provider = ((raw_data.ShippingProvider as string) || "").toLowerCase();
    return provider ? `regular - ${provider}` : "regular";
  }
  if (spt === "direct" || spt === "falaflex") return "direct";
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
  // Falabella
  if (raw_data?.OrderNumber) return String(raw_data.OrderNumber);
  // ML: pack_id (top-level helper stored by mapper)
  if (raw_data?.pack_id) return String(raw_data.pack_id);
  // ML: pack_id nested in order object
  const mlOrder = raw_data?.order as Record<string, unknown> | undefined;
  if (mlOrder?.pack_id) return String(mlOrder.pack_id);
  return fallback ?? "";
}

export function getTrackingUrl(raw_data?: Record<string, unknown>, tracking?: string): string | null {
  if (!raw_data || !tracking) return null;
  const spt = ((raw_data.ShippingProviderType as string) || "").toLowerCase();
  const deliveryMode = ((raw_data.delivery_mode as string) || "").toLowerCase();

  // Falabella Regular: BlueExpress or Chilexpress
  if (spt === "regular") {
    const provider = ((raw_data.ShippingProvider as string) || "").toLowerCase();
    if (provider.includes("blue")) return `https://www.blue.cl/enviar/seguimiento?n_seguimiento=${tracking}`;
    if (provider.includes("chilexpress")) return `https://centrodeayuda.chilexpress.cl/seguimiento/${tracking}`;
  }

  // Falabella Direct (falaflex) or ML Flex: Welivery
  if (spt === "falaflex" || spt === "direct" || deliveryMode === "flex") {
    return `https://welivery.cl/tracking/index.php?wid=${tracking}`;
  }

  return null;
}

export function getTrackingCode(raw_data?: Record<string, unknown>): string {
  if (!raw_data) return "";
  // Falabella
  if (raw_data.TrackingCode) return String(raw_data.TrackingCode);
  if (raw_data.tracking_code) return String(raw_data.tracking_code);
  if (raw_data.TrackingNumber) return String(raw_data.TrackingNumber);
  if (raw_data.ShipmentId) return String(raw_data.ShipmentId);
  // ML: top-level helper stored by mapper
  if (raw_data.tracking_number) return String(raw_data.tracking_number);
  // ML: nested in shipment object
  const shipment = raw_data.shipment as Record<string, unknown> | undefined;
  if (shipment?.tracking_number) return String(shipment.tracking_number);
  return "";
}

export interface ProductDetails {
  title: string | null;
  sku: string | null;
  quantity: number | null;
}

export function getProductDetails(raw_data?: Record<string, unknown>, product_name?: string | null, product_quantity?: number | null): ProductDetails {
  let sku: string | null = null;
  // ML: top-level helper
  if (raw_data?.seller_sku) {
    sku = String(raw_data.seller_sku);
  } else {
    // ML: nested
    const mlOrder = raw_data?.order as Record<string, unknown> | undefined;
    const items = mlOrder?.order_items as Record<string, unknown>[] | undefined;
    if (items?.length) {
      const item = (items[0]?.item ?? {}) as Record<string, unknown>;
      sku = (item.seller_sku as string) ?? null;
    }
    // Falabella
    if (!sku) {
      const fItems = raw_data?._items as Record<string, unknown>[] | undefined;
      if (fItems?.length) sku = (fItems[0]?.SellerSku as string) ?? (fItems[0]?.Sku as string) ?? null;
    }
  }
  return { title: product_name ?? null, sku, quantity: product_quantity ?? null };
}

export interface ShippingDestination {
  city: string | null;
  comuna: string | null;
}

export function getShippingDestination(raw_data?: Record<string, unknown>): ShippingDestination {
  if (!raw_data) return { city: null, comuna: null };

  // Falabella: AddressShipping.City + AddressShipping.Ward ("CIUDAD - COMUNA")
  const addrShipping = raw_data.AddressShipping as Record<string, unknown> | undefined;
  if (addrShipping) {
    const city = addrShipping.City ? String(addrShipping.City) : null;
    const ward = addrShipping.Ward ? String(addrShipping.Ward) : null;
    let comuna: string | null = null;
    if (ward) {
      const parts = ward.split(" - ");
      comuna = parts.length > 1 ? parts[parts.length - 1].trim() : ward.trim();
    }
    return { city, comuna };
  }

  // ML: shipment.receiver_address.city.name + neighborhood.name
  const shipment = raw_data.shipment as Record<string, unknown> | undefined;
  const addr = shipment?.receiver_address as Record<string, unknown> | undefined;
  if (addr) {
    const cityObj = addr.city as Record<string, unknown> | undefined;
    const neighborhoodObj = addr.neighborhood as Record<string, unknown> | undefined;
    const stateObj = addr.state as Record<string, unknown> | undefined;
    const cityName = cityObj?.name ? String(cityObj.name) : null;
    const stateId = stateObj?.id ? String(stateObj.id) : null;
    // CL-RM = Región Metropolitana: city.name is the commune, not the city
    const city = stateId === "CL-RM" ? "Santiago" : cityName;
    const rawComuna = neighborhoodObj?.name ? String(neighborhoodObj.name) : null;
    const comuna = rawComuna || cityName;
    return { city, comuna };
  }

  return { city: null, comuna: null };
}

/** Formats delivery deadline as DD/MM/YYYY HH:mm in Santiago timezone. */
export function formatDeadline(isoString: string | null, _source?: string): string {
  if (!isoString) return "—";
  const d = new Date(isoString);
  const datePart = d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Santiago",
  });
  const timePart = d.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Santiago",
  });
  return `${datePart} ${timePart}`;
}
