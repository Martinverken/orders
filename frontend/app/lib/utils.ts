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
  two_or_more_days: "2+ días",
  on_time: "A tiempo",
};

export const URGENCY_CLASSES: Record<OrderUrgency, string> = {
  overdue: "bg-red-100 text-red-700 border-red-200",
  due_today: "bg-amber-100 text-amber-700 border-amber-200",
  delivered_today: "bg-green-100 text-green-700 border-green-200",
  tomorrow: "bg-blue-100 text-blue-700 border-blue-200",
  two_or_more_days: "bg-purple-100 text-purple-700 border-purple-200",
  on_time: "bg-gray-100 text-gray-600 border-gray-200",
};

export const SOURCE_LABEL: Record<string, string> = {
  falabella: "Falabella",
  mercadolibre: "Mercado Libre",
  walmart: "Walmart",
  paris: "Paris",
  shopify_verken: "Shopify Verken",
  shopify_kaut: "Shopify Kaut",
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

/**
 * Determine the shipping method category from source + raw_data.
 * Returns "Express", "Direct/Flex", or "Regular/Centro Envíos".
 */
export function getShippingMethod(source: string, raw_data?: Record<string, unknown>): string {
  if (source.startsWith("shopify")) {
    const tags = ((raw_data?.tags as string) || "").toLowerCase().split(",").map((t) => t.trim());
    return tags.includes("express") ? "Express" : "Regular/Centro Envíos";
  }
  if (source === "falabella") {
    const spt = ((raw_data?.ShippingProviderType as string) || "").toLowerCase();
    if (spt === "direct" || spt === "falaflex") return "Direct/Flex";
    return "Regular/Centro Envíos";
  }
  if (source === "mercadolibre") {
    const mode = ((raw_data?.delivery_mode as string) || "").toLowerCase();
    if (mode === "flex" || mode === "self_service") return "Direct/Flex";
    return "Regular/Centro Envíos";
  }
  // Paris, Walmart: always Regular
  return "Regular/Centro Envíos";
}

/**
 * Determine the logistics operator (carrier) from source + raw_data.
 * Returns clean operator name: Welivery, Bluexpress, Chilexpress, Mercado Libre, Transporte Interno.
 */
export function getOperator(source: string, raw_data?: Record<string, unknown>): string {
  if (source.startsWith("shopify")) return "Welivery";
  if (source === "walmart") return "Transporte Interno";
  if (source === "paris") {
    const subs = (raw_data?.subOrders as Record<string, unknown>[]) || [];
    const carrier = subs?.[0]?.carrier ? String(subs[0].carrier) : "";
    return carrier || "Enviame";
  }
  if (source === "falabella") {
    const spt = ((raw_data?.ShippingProviderType as string) || "").toLowerCase();
    if (spt === "direct" || spt === "falaflex") return "Welivery";
    const provider = ((raw_data?.ShippingProvider as string) || "").toLowerCase();
    if (provider.includes("blue")) return "Bluexpress";
    if (provider.includes("chilex")) return "Chilexpress";
    return provider || "Regular";
  }
  if (source === "mercadolibre") {
    const mode = ((raw_data?.delivery_mode as string) || "").toLowerCase();
    if (mode === "flex" || mode === "self_service") return "Welivery";
    return "Mercado Libre";
  }
  return "";
}

// Legacy carrier function (kept for backwards compat)
export function getCarrier(raw_data?: Record<string, unknown>): string {
  if (!raw_data) return "";

  // Walmart: always Transporte Interno
  if (raw_data.purchaseOrderId !== undefined) return "Transporte Interno";

  // Paris: carrier from first subOrder
  if (raw_data.subOrders !== undefined) {
    const subs = raw_data.subOrders as Record<string, unknown>[];
    return subs?.[0]?.carrier ? String(subs[0].carrier) : "Enviame";
  }

  // Shopify: detect carrier from tags
  if (raw_data.financial_status !== undefined && raw_data.line_items !== undefined) {
    const tags = ((raw_data.tags as string) || "").toLowerCase().split(",").map((t) => t.trim());
    if (tags.includes("skn")) return "Starken";
    if (tags.includes("rapiboy")) return "Rapiboy";
    return "Welivery";
  }

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
  // Shopify: order name e.g. "#1234" + fulfillment index for multi-bulto
  if (raw_data?.name && raw_data?.financial_status !== undefined) {
    const fulIdx = raw_data._fulfillment_index;
    const suffix = fulIdx !== undefined ? ` (bulto ${Number(fulIdx) + 1})` : "";
    return String(raw_data.name) + suffix;
  }
  // Walmart: purchaseOrderId + line index for multi-bulto
  if (raw_data?.purchaseOrderId) {
    const lineIdx = raw_data._line_index;
    const suffix = lineIdx !== undefined ? ` (bulto ${Number(lineIdx) + 1})` : "";
    return String(raw_data.purchaseOrderId) + suffix;
  }
  // Paris: originOrderNumber or subOrderNumber + suborder index for multi-bulto
  if (raw_data?.subOrders !== undefined) {
    const subIdx = raw_data._suborder_index;
    const subs = raw_data.subOrders as Record<string, unknown>[];
    const base = subs?.[0]?.subOrderNumber ? String(subs[0].subOrderNumber) : (raw_data.originOrderNumber ? String(raw_data.originOrderNumber) : fallback ?? "");
    const suffix = subIdx !== undefined ? ` (bulto ${Number(subIdx) + 1})` : "";
    return base + suffix;
  }
  // Falabella: OrderNumber + item index for multi-bulto orders
  if (raw_data?.OrderNumber) {
    const itemIndex = raw_data._item_index;
    const suffix = itemIndex !== undefined ? ` (bulto ${Number(itemIndex) + 1})` : "";
    return String(raw_data.OrderNumber) + suffix;
  }
  // ML: pack_id (top-level helper stored by mapper)
  if (raw_data?.pack_id) return String(raw_data.pack_id);
  // ML: pack_id nested in order object
  const mlOrder = raw_data?.order as Record<string, unknown> | undefined;
  if (mlOrder?.pack_id) return String(mlOrder.pack_id);
  return fallback ?? "";
}

export function getTrackingUrl(raw_data?: Record<string, unknown>, tracking?: string): string | null {
  if (!raw_data || !tracking) return null;

  // Shopify: Welivery tracking URL using order number
  if (raw_data.financial_status !== undefined && raw_data.name) {
    return `https://welivery.cl/tracking/index.php?wid=${tracking}`;
  }

  // Walmart: use trackingURL from API if available, otherwise enviame generic
  if (raw_data.purchaseOrderId !== undefined) {
    // Check if tracking is already a full URL from trackingURL field
    if (tracking.startsWith("http")) return tracking;
    // Try to extract trackingURL from raw data
    const orderLines = raw_data.orderLines as Record<string, unknown> | undefined;
    const lineList = orderLines?.orderLine as Record<string, unknown>[] | undefined;
    if (lineList?.length) {
      const statuses = lineList[0]?.orderLineStatuses as Record<string, unknown>[] | undefined;
      if (statuses?.length) {
        const trackingInfo = statuses[0]?.trackingInfo as Record<string, unknown> | undefined;
        if (trackingInfo?.trackingURL) return String(trackingInfo.trackingURL);
      }
    }
    return `https://tracking.enviame.io/${tracking}`;
  }

  // Paris: enviame delivery link using deliveryExternalId
  if (raw_data.subOrders !== undefined) {
    if (tracking.startsWith("http")) return tracking;
    const subs = raw_data.subOrders as Record<string, unknown>[];
    if (subs?.[0]?.deliveryExternalId) return `https://app.enviame.io/deliveries/${subs[0].deliveryExternalId}`;
    return `https://tracking.enviame.io/${tracking}`;
  }

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
  // Shopify: use fulfillment tracking_number if available (multi-bulto), else order name
  if (raw_data.financial_status !== undefined && raw_data.name) {
    const fulfillments = raw_data.fulfillments as Record<string, unknown>[] | undefined;
    if (fulfillments?.length === 1 && fulfillments[0]?.tracking_number) {
      return String(fulfillments[0].tracking_number);
    }
    return String(raw_data.name).replace(/^#/, "");
  }
  // Walmart: trackingInfo nested in orderLineStatuses[0].trackingInfo
  if (raw_data.purchaseOrderId !== undefined) {
    const orderLines = raw_data.orderLines as Record<string, unknown> | undefined;
    const lineList = orderLines?.orderLine as Record<string, unknown>[] | undefined;
    if (lineList?.length) {
      // orderLineStatuses is unwrapped by mapper to a plain array
      const statuses = lineList[0]?.orderLineStatuses as Record<string, unknown>[] | undefined;
      if (statuses?.length) {
        const trackingInfo = statuses[0]?.trackingInfo as Record<string, unknown> | undefined;
        if (trackingInfo?.trackingNumber) return String(trackingInfo.trackingNumber);
      }
    }
    return "";
  }
  // Paris: deliveryExternalId from first subOrder (enviame delivery ID)
  if (raw_data.subOrders !== undefined) {
    const subs = raw_data.subOrders as Record<string, unknown>[];
    if (subs?.[0]?.deliveryExternalId) return String(subs[0].deliveryExternalId);
    if (subs?.[0]?.trackingNumber) return String(subs[0].trackingNumber);
    return "";
  }
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
    // Shopify: line_items[0].sku
    if (!sku) {
      const lineItems = raw_data?.line_items as Record<string, unknown>[] | undefined;
      if (lineItems?.length) {
        sku = (lineItems[0]?.sku as string) || null;
      }
    }
    // Walmart: orderLines.orderLine[0].item.sku
    if (!sku) {
      const orderLines = raw_data?.orderLines as Record<string, unknown> | undefined;
      const lineList = orderLines?.orderLine as Record<string, unknown>[] | undefined;
      if (lineList?.length) {
        const item = lineList[0]?.item as Record<string, unknown> | undefined;
        sku = (item?.sku as string) ?? null;
      }
    }
    // Paris: subOrders[0].items[0].sellerSku or .sku
    if (!sku) {
      const subs = raw_data?.subOrders as Record<string, unknown>[] | undefined;
      if (subs?.length) {
        const items = subs[0]?.items as Record<string, unknown>[] | undefined;
        if (items?.length) {
          sku = (items[0]?.sellerSku as string) || (items[0]?.sku as string) || null;
        }
      }
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

  // Shopify: shipping_address.city + province
  if (raw_data.shipping_address) {
    const addr = raw_data.shipping_address as Record<string, unknown>;
    return {
      city: addr.city ? String(addr.city) : null,
      comuna: addr.province ? String(addr.province) : null,
    };
  }

  // Paris: shippingAddress from first subOrder
  if (raw_data.subOrders !== undefined) {
    const subs = raw_data.subOrders as Record<string, unknown>[];
    const addr = subs?.[0]?.shippingAddress as Record<string, unknown> | undefined;
    return {
      city: addr?.city ? String(addr.city) : null,
      comuna: addr?.communaCode ? String(addr.communaCode) : null,
    };
  }

  // Walmart: shippingInfo.postalAddress.city
  if (raw_data.purchaseOrderId !== undefined) {
    const shipping = raw_data.shippingInfo as Record<string, unknown> | undefined;
    const postal = shipping?.postalAddress as Record<string, unknown> | undefined;
    return {
      city: postal?.city ? String(postal.city) : null,
      comuna: postal?.city ? String(postal.city) : null,
    };
  }

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

export function getCreatedAt(raw_data?: Record<string, unknown>): string | null {
  // Shopify
  if (raw_data?.financial_status !== undefined && raw_data?.created_at) return String(raw_data.created_at);
  // Paris
  if (raw_data?.createdAt && raw_data?.subOrders !== undefined) return String(raw_data.createdAt);
  if (raw_data?.originOrderDate && raw_data?.subOrders !== undefined) return String(raw_data.originOrderDate);
  // Falabella
  if (raw_data?.CreatedAt) return String(raw_data.CreatedAt);
  // ML: nested in order object
  const mlOrder = raw_data?.order as Record<string, unknown> | undefined;
  if (mlOrder?.date_created) return String(mlOrder.date_created);
  return null;
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
