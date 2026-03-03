from models.order import OrderCreate
from integrations.mercadolibre.schemas import MLOrder, MLShipmentDetail
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

# Mercado Libre logistic_type → human-readable delivery mode
LOGISTIC_MODE_MAP = {
    "fulfillment": "Centro de Envíos",
    "self_service": "Flex",
    "cross_docking": "Agencia",
    "drop_off": "Drop Off",
    "xd_drop_off": "Cross Docking",
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
            date_str = edt.get("date") or edt.get("to")
            if date_str:
                return parse_ml_datetime(date_str)
        elif isinstance(edt, str):
            return parse_ml_datetime(edt)

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
    delivery_mode = resolve_delivery_mode(logistic_type)

    raw_data = {"order": order_raw, "shipment": shipment_raw, "delivery_mode": delivery_mode}

    # Extract product info from order_items
    product_name = None
    product_quantity = None
    order_items = order_raw.get("order_items") or []
    if isinstance(order_items, list) and order_items:
        first_item = order_items[0] if isinstance(order_items[0], dict) else {}
        item_detail = first_item.get("item") or {}
        product_name = item_detail.get("title")
        qty = first_item.get("quantity")
        if qty is not None:
            try:
                product_quantity = int(qty)
            except (ValueError, TypeError):
                pass

    return OrderCreate(
        external_id=str(order.id),
        source="mercadolibre",
        status=order.status or "unknown",
        created_at_source=parse_ml_datetime(order.date_created),
        address_updated_at=parse_ml_datetime(order.date_last_updated),
        limit_delivery_date=limit_delivery_date,
        product_name=product_name,
        product_quantity=product_quantity,
        raw_data=raw_data,
    )
