from models.order import OrderCreate
from integrations.falabella.schemas import FalabellaOrder
from utils.business_days import compute_handoff_deadline
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
    """Convert raw Falabella order dict to canonical OrderCreate.

    For single-item orders returns one OrderCreate.
    For multi-item orders (multiple bultos/tracking codes) returns one per item
    via to_order_creates().  This wrapper returns only the first for backwards compat.
    """
    results = to_order_creates(raw)
    return results[0] if results else None


def to_order_creates(raw: dict) -> list[OrderCreate]:
    """Convert raw Falabella order dict to canonical OrderCreate(s).

    When an order has multiple items with different tracking codes (bultos),
    each item becomes a separate OrderCreate with external_id = '{OrderId}-{index}'.
    Single-item orders keep external_id = '{OrderId}'.
    """
    order = FalabellaOrder(**raw)

    # Skip orders fulfilled by Falabella's own warehouse (no action needed from seller)
    shipping_type = (raw.get("ShippingType") or "").strip()
    if shipping_type == "Fulfilled by Falabella":
        logger.info(f"Order {order.OrderId} is FBF — skipping")
        return []

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
                return []
        else:
            logger.warning(f"Order {order.OrderId} has no delivery date — skipping")
            return []

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

    # Direct/FalaFlex: "shipped" = Welivery recogió del seller, aún no entregó al cliente.
    # Map to "ready_to_ship" so compute_urgency returns DUE_TODAY instead of DELIVERED_TODAY.
    if shipping_provider_type in _DIRECT_PROVIDER_TYPES and status == "shipped":
        status = "ready_to_ship"

    # Compute limit_handoff_date:
    # Regular: handoff = limit_delivery_date (PromisedShippingTime IS the handoff deadline)
    # Direct/Flex: cutoff 13:00 → handoff at 18:00 (same day or next business day)
    created_at_source = parse_falabella_datetime(order.CreatedAt)
    if shipping_provider_type in _DIRECT_PROVIDER_TYPES and created_at_source:
        limit_handoff_date = compute_handoff_deadline(created_at_source)
    else:
        limit_handoff_date = limit_delivery_date

    items = raw.get("_items") or []
    if not isinstance(items, list):
        items = []

    # Determine if we need to split into multiple records (one per bulto)
    # Split when there are multiple items with different tracking codes
    tracking_codes = {(item.get("TrackingCode") or "") for item in items if isinstance(item, dict)}
    tracking_codes.discard("")
    should_split = len(tracking_codes) > 1 and len(items) > 1

    if should_split:
        results = []
        for idx, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            product_name = item.get("Name") or item.get("name")
            qty = item.get("Quantity") or item.get("quantity")
            product_quantity = None
            if qty is not None:
                try:
                    product_quantity = int(qty)
                except (ValueError, TypeError):
                    pass
            # Per-item raw_data: copy order-level data, override with item-specific fields
            item_raw = {**raw, "_items": [item]}
            item_raw["TrackingCode"] = item.get("TrackingCode") or raw.get("TrackingCode", "")
            item_raw["_item_index"] = idx
            results.append(OrderCreate(
                external_id=f"{order.OrderId}-{idx}",
                source="falabella",
                status=status,
                created_at_source=created_at_source,
                address_updated_at=parse_falabella_datetime(order.AddressUpdatedAt),
                limit_delivery_date=limit_delivery_date,
                limit_handoff_date=limit_handoff_date,
                product_name=product_name,
                product_quantity=product_quantity,
                raw_data=item_raw,
            ))
        return results
    else:
        # Single item or no items — original behavior
        product_name = None
        product_quantity = None
        if items:
            first_item = items[0] if isinstance(items[0], dict) else {}
            product_name = first_item.get("Name") or first_item.get("name")
            qty = first_item.get("Quantity") or first_item.get("quantity")
            if qty is not None:
                try:
                    product_quantity = int(qty)
                except (ValueError, TypeError):
                    pass

        return [OrderCreate(
            external_id=str(order.OrderId),
            source="falabella",
            status=status,
            created_at_source=created_at_source,
            address_updated_at=parse_falabella_datetime(order.AddressUpdatedAt),
            limit_delivery_date=limit_delivery_date,
            limit_handoff_date=limit_handoff_date,
            product_name=product_name,
            product_quantity=product_quantity,
            raw_data=raw,
        )]
