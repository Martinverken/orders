from models.order import OrderCreate
from integrations.mercadolibre.schemas import MLOrder, MLShipmentDetail
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

# Mercado Libre logistic_type → human-readable delivery mode
LOGISTIC_MODE_MAP = {
    "fulfillment": "Centro de Envíos",
    "self_service": "Flex",
    "cross_docking": "Centro de Envíos",
    "drop_off": "Centro de Envíos",
    "xd_drop_off": "Centro de Envíos",
    "not_specified": "Sin especificar",
}


def parse_ml_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    formats = [
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%d",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(value, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    logger.warning(f"Could not parse ML datetime: {value}")
    return None


def resolve_delivery_mode(logistic_type: str | None) -> str:
    return LOGISTIC_MODE_MAP.get(logistic_type or "", "Desconocido")


def resolve_delivery_deadline(shipment: MLShipmentDetail | None) -> datetime | None:
    """Resolve limit_delivery_date from shipment data.

    Primary:  shipping_option.estimated_delivery_time.pay_before
              This is the SELLER's action deadline — when we must dispatch / drop off
              at the ML carrier. For xd_drop_off (Centro de Envíos) this is often
              1-2 days earlier than estimated_delivery_limit (which is the customer
              delivery date), so it is the correct field for urgency and late checks.

    Fallback: shipping_option.estimated_delivery_limit.date
              Used when pay_before is absent.

    Last resort: top-level estimated_delivery_time.date / .to
              Present even after the deadline has passed (pay_before disappears).
    """
    if not shipment:
        return None

    if shipment.shipping_option:
        opt = shipment.shipping_option
        if isinstance(opt, dict):
            # Primary: seller dispatch deadline
            edt_inner = opt.get("estimated_delivery_time")
            if isinstance(edt_inner, dict):
                pay_before = edt_inner.get("pay_before")
                if pay_before:
                    return parse_ml_datetime(pay_before)

            # Fallback: customer delivery deadline
            limit = opt.get("estimated_delivery_limit")
            if isinstance(limit, dict):
                date_str = limit.get("date")
                if date_str:
                    return parse_ml_datetime(date_str)

    # Last resort: top-level estimated_delivery_time (present after deadline passes)
    if shipment.estimated_delivery_time:
        edt = shipment.estimated_delivery_time
        if isinstance(edt, dict):
            date_str = edt.get("date") or edt.get("to")
            if date_str:
                return parse_ml_datetime(date_str)

    return None


def to_order_create(order_raw: dict, shipment_raw: dict | None = None) -> OrderCreate | None:
    """Convert raw ML order + optional shipment detail to canonical OrderCreate."""
    order = MLOrder(**order_raw)
    shipment = MLShipmentDetail(**shipment_raw) if shipment_raw else None

    logistic_type = (shipment.logistic_type if shipment else None) or (
        order.shipping.logistic_type if order.shipping else None
    )

    if logistic_type == "fulfillment":
        logger.info(f"ML order {order.id} is fulfillment (managed by ML warehouse) — skipping")
        return None

    limit_delivery_date = resolve_delivery_deadline(shipment)
    if not limit_delivery_date:
        logger.warning(f"ML order {order.id} has no delivery date (shipping_option.estimated_delivery_limit.date) — skipping")
        return None

    # Skip orders already delivered — no action needed
    shipment_status = (shipment.status if shipment else None) or order.status or "unknown"
    if shipment_status == "delivered":
        logger.info(f"ML order {order.id} already delivered — skipping")
        return None

    delivery_mode = resolve_delivery_mode(logistic_type)

    # Extract product info from order_items
    product_name = None
    product_quantity = None
    seller_sku = None
    order_items = order_raw.get("order_items") or []
    if isinstance(order_items, list) and order_items:
        first_item = order_items[0] if isinstance(order_items[0], dict) else {}
        item_detail = first_item.get("item") or {}
        product_name = item_detail.get("title")
        seller_sku = item_detail.get("seller_sku")
        qty = first_item.get("quantity")
        if qty is not None:
            try:
                product_quantity = int(qty)
            except (ValueError, TypeError):
                pass

    raw_data = {
        "order": order_raw,
        "shipment": shipment_raw,
        "delivery_mode": delivery_mode,
        # Top-level helpers for frontend
        "pack_id": order_raw.get("pack_id"),
        "tracking_number": shipment_raw.get("tracking_number") if shipment_raw else None,
        "seller_sku": seller_sku,
    }

    return OrderCreate(
        external_id=str(order.id),
        source="mercadolibre",
        status=shipment_status,
        created_at_source=parse_ml_datetime(order.date_created),
        address_updated_at=parse_ml_datetime(order.date_last_updated),
        limit_delivery_date=limit_delivery_date,
        product_name=product_name,
        product_quantity=product_quantity,
        raw_data=raw_data,
    )
