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


def resolve_delivery_deadline(order: MLOrder, shipment: MLShipmentDetail | None) -> datetime | None:
    """
    Resolve limit_delivery_date from:
    1. shipment.estimated_delivery_time (most accurate)
    2. order.expiration_date
    """
    if shipment and shipment.estimated_delivery_time:
        edt = shipment.estimated_delivery_time
        if isinstance(edt, dict):
            # ML uses various key names depending on shipment type
            date_str = (
                edt.get("date")
                or edt.get("to")
                or edt.get("date_to")
                or edt.get("end")
                or edt.get("from")
                or edt.get("date_from")
            )
            if date_str:
                return parse_ml_datetime(date_str)
        elif isinstance(edt, str):
            return parse_ml_datetime(edt)

    # Fallback: shipping_option has the real deadline for ready_to_ship orders
    if shipment and shipment.shipping_option:
        opt = shipment.shipping_option
        if isinstance(opt, dict):
            for key in ("estimated_delivery_limit", "estimated_delivery_time", "estimated_delivery_extended", "estimated_delivery_final"):
                nested = opt.get(key)
                if isinstance(nested, dict):
                    date_str = nested.get("date") or nested.get("to")
                    if date_str:
                        return parse_ml_datetime(date_str)

    if order.expiration_date:
        return parse_ml_datetime(order.expiration_date)

    return None


def to_order_create(order_raw: dict, shipment_raw: dict | None = None) -> OrderCreate | None:
    """Convert raw ML order + optional shipment detail to canonical OrderCreate."""
    order = MLOrder(**order_raw)
    shipment = MLShipmentDetail(**shipment_raw) if shipment_raw else None

    limit_delivery_date = resolve_delivery_deadline(order, shipment)
    if not limit_delivery_date:
        logger.warning(f"ML order {order.id} has no delivery date — skipping")
        return None

    logistic_type = (shipment.logistic_type if shipment else None) or (
        order.shipping.logistic_type if order.shipping else None
    )

    if logistic_type == "fulfillment":
        logger.info(f"ML order {order.id} is fulfillment (managed by ML warehouse) — skipping")
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

    # Use shipment status as order status so urgency is computed correctly
    shipment_status = (shipment.status if shipment else None) or order.status or "unknown"

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
