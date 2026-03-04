from models.order import OrderCreate
from integrations.falabella.schemas import FalabellaOrder
from datetime import datetime
from zoneinfo import ZoneInfo
import logging

_SANTIAGO = ZoneInfo("America/Santiago")
_DIRECT_PROVIDER_TYPES = {"falaflex", "direct"}

logger = logging.getLogger(__name__)


def parse_falabella_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(value, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=_SANTIAGO)
            return dt
        except ValueError:
            continue
    logger.warning(f"Could not parse datetime: {value}")
    return None


def to_order_create(raw: dict) -> OrderCreate | None:
    """Convert raw Falabella order dict to canonical OrderCreate."""
    order = FalabellaOrder(**raw)

    # Skip orders fulfilled by Falabella's own warehouse (no action needed from seller)
    shipping_type = (raw.get("ShippingType") or "").strip()
    if shipping_type == "Fulfilled by Falabella":
        logger.info(f"Order {order.OrderId} is FBF — skipping")
        return None

    # Resolve delivery deadline — actual field name in API response is PromisedShippingTime
    delivery_raw = (
        raw.get("PromisedShippingTime")   # primary (confirmed from real API)
        or raw.get("limit_delivery_date") # fallback documented name
        or raw.get("PromisedShippingDate") # alternative name
    )
    limit_delivery_date = parse_falabella_datetime(delivery_raw)

    shipping_provider_type = (raw.get("ShippingProviderType") or "").strip().lower()

    if not limit_delivery_date:
        # Direct orders: if Falabella doesn't provide a deadline, fall back to 23:30 Santiago
        # on the order creation date (or skip if creation date also missing)
        if shipping_provider_type in _DIRECT_PROVIDER_TYPES:
            created = parse_falabella_datetime(order.CreatedAt)
            if created:
                local = created.astimezone(_SANTIAGO)
                limit_delivery_date = local.replace(hour=23, minute=30, second=0, microsecond=0)
            else:
                logger.warning(f"Order {order.OrderId} has no delivery date — skipping")
                return None
        else:
            logger.warning(f"Order {order.OrderId} has no delivery date — skipping")
            return None

    # Resolve status — Statuses comes as [{"Status": "pending"}] from real API
    status = "unknown"
    statuses_raw = raw.get("Statuses", [])
    if isinstance(statuses_raw, list) and statuses_raw:
        first = statuses_raw[0]
        if isinstance(first, dict):
            status = first.get("Status", "unknown")
        elif isinstance(first, str):
            status = first
    elif isinstance(statuses_raw, dict):
        status = statuses_raw.get("Status", "unknown")
    elif isinstance(statuses_raw, str):
        status = statuses_raw

    # Regular orders: "delivered" means Falabella's carrier handled it — our job ended
    # at "shipped". The "delivered" status fetch (needed for Direct UpdatedAt) re-inserts
    # these orders and breaks cleanup. Skip them here so the cleanup sees them as
    # left_feed=True and archives them correctly.
    if status == "delivered" and shipping_provider_type not in _DIRECT_PROVIDER_TYPES:
        logger.info(f"Order {order.OrderId} is regular+delivered — skipping")
        return None

    # Extract product info from items fetched by the client (_items key)
    product_name = None
    product_quantity = None
    items = raw.get("_items") or []
    if isinstance(items, list) and items:
        first_item = items[0] if isinstance(items[0], dict) else {}
        product_name = first_item.get("Name") or first_item.get("name")
        qty = first_item.get("Quantity") or first_item.get("quantity")
        if qty is not None:
            try:
                product_quantity = int(qty)
            except (ValueError, TypeError):
                pass

    return OrderCreate(
        external_id=str(order.OrderId),
        source="falabella",
        status=status,
        created_at_source=parse_falabella_datetime(order.CreatedAt),
        address_updated_at=parse_falabella_datetime(order.AddressUpdatedAt),
        limit_delivery_date=limit_delivery_date,
        product_name=product_name,
        product_quantity=product_quantity,
        raw_data=raw,
    )
