from models.order import OrderCreate
from integrations.mercadolibre.schemas import MLOrder, MLShipmentDetail
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import logging

_SANTIAGO = ZoneInfo("America/Santiago")


def _end_of_day_santiago(dt: datetime) -> datetime:
    """Return same calendar date at 23:59:00 Santiago time."""
    local = dt.astimezone(_SANTIAGO)
    return local.replace(hour=23, minute=59, second=0, microsecond=0)

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


def resolve_delivery_deadline(
    shipment: MLShipmentDetail | None,
    shipment_raw: dict | None = None,
) -> datetime | None:
    """Resolve limit_delivery_date from shipment data.

    Flex (self_service):
        estimated_delivery_limit.date — customer delivery promise date.

    Centro de Envíos (xd_drop_off / cross_docking / drop_off):
        date_handling + handling_time.amount hours — matches the "Despachar antes de HH:mm"
        shown on the ML shipping label (e.g. date_handling=Mar 3 11:11 + 24h = Mar 4 11:11).
        Falls back to pay_before then estimated_delivery_limit.date if status_history is absent.

    Last resort: top-level estimated_delivery_time.date / .to
        Present even after the deadline has passed.
    """
    if not shipment:
        return None

    is_flex = str(shipment.logistic_type or "").lower() == "self_service"

    opt = shipment.shipping_option if isinstance(shipment.shipping_option, dict) else None

    # CE: date_handling + handling_time.amount = exact "Despachar antes de HH:mm" on the label
    if not is_flex and shipment_raw:
        status_history = shipment_raw.get("status_history") or {}
        date_handling_str = status_history.get("date_handling")
        if date_handling_str:
            date_handling = parse_ml_datetime(date_handling_str)
            if date_handling:
                opt_raw = shipment_raw.get("shipping_option") or {}
                ht = opt_raw.get("handling_time") or {}
                handling_hours = ht.get("amount") if ht.get("unit") == "hour" else None
                if handling_hours:
                    from datetime import timedelta
                    return date_handling + timedelta(hours=int(handling_hours))

    # CE fallback: pay_before inside estimated_delivery_time
    if not is_flex and opt:
        edt_inner = opt.get("estimated_delivery_time")
        if isinstance(edt_inner, dict):
            pay_before_str = edt_inner.get("pay_before")
            if pay_before_str:
                dt = parse_ml_datetime(pay_before_str)
                if dt:
                    return dt

    # Flex: estimated_delivery_limit.date; also fallback for CE when status_history absent
    if opt:
        limit = opt.get("estimated_delivery_limit")
        if isinstance(limit, dict):
            date_str = limit.get("date")
            if date_str:
                dt = parse_ml_datetime(date_str)
                if dt:
                    return _end_of_day_santiago(dt) if is_flex else dt

    # Last resort: top-level estimated_delivery_time (present after deadline passes)
    if shipment.estimated_delivery_time:
        edt = shipment.estimated_delivery_time
        if isinstance(edt, dict):
            date_str = edt.get("date") or edt.get("to")
            if date_str:
                dt = parse_ml_datetime(date_str)
                if dt:
                    return _end_of_day_santiago(dt) if is_flex else dt

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

    limit_delivery_date = resolve_delivery_deadline(shipment, shipment_raw)
    if not limit_delivery_date:
        logger.warning(f"ML order {order.id} has no delivery date (shipping_option.estimated_delivery_limit.date) — skipping")
        return None

    # Skip orders already delivered — no action needed
    shipment_status = (shipment.status if shipment else None) or order.status or "unknown"
    if shipment_status == "delivered":
        logger.info(f"ML order {order.id} already delivered — skipping")
        return None

    # Flex (self_service): "shipped" = seller is still delivering to customer, not terminal.
    # Map to "ready_to_ship" so compute_urgency returns DUE_TODAY instead of DELIVERED_TODAY.
    if logistic_type == "self_service" and shipment_status == "shipped":
        shipment_status = "ready_to_ship"

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
