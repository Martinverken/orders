from models.order import OrderCreate
from integrations.falabella.schemas import FalabellaOrder
from datetime import datetime, timezone
import logging

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
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    logger.warning(f"Could not parse datetime: {value}")
    return None


def to_order_create(raw: dict) -> OrderCreate | None:
    """Convert raw Falabella order dict to canonical OrderCreate."""
    order = FalabellaOrder(**raw)

    # Resolve delivery deadline — actual field name in API response is PromisedShippingTime
    delivery_raw = (
        raw.get("PromisedShippingTime")   # primary (confirmed from real API)
        or raw.get("limit_delivery_date") # fallback documented name
        or raw.get("PromisedShippingDate") # alternative name
    )
    limit_delivery_date = parse_falabella_datetime(delivery_raw)

    if not limit_delivery_date:
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

    return OrderCreate(
        external_id=str(order.OrderId),
        source="falabella",
        status=status,
        created_at_source=parse_falabella_datetime(order.CreatedAt),
        address_updated_at=parse_falabella_datetime(order.AddressUpdatedAt),
        limit_delivery_date=limit_delivery_date,
        raw_data=raw,
    )
