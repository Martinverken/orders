"""Paris (Cencosud) order mapper.

Converts raw Paris API response into canonical OrderCreate.
Paris shipping logic is identical to Falabella Regular:
- Carrier picks up from warehouse
- Deadline = when seller hands package to carrier (promised_shipping_time)
- Terminal state: shipped (carrier took it)

STUB: Field names may need adjustment once real API responses are available.
Docs: https://developers.ecomm.cencosud.com/docs
"""

from datetime import datetime
from zoneinfo import ZoneInfo
import logging

from models.order import OrderCreate
from integrations.paris.schemas import ParisOrder

logger = logging.getLogger(__name__)

_SANTIAGO = ZoneInfo("America/Santiago")


def parse_paris_datetime(value: str | None) -> datetime | None:
    """Parse datetime string from Paris API.

    TODO: Adjust formats once real API response format is known.
    Tries common ISO formats used by Seller Center platforms.
    """
    if not value:
        return None
    formats = [
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
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
    logger.warning(f"[paris] Could not parse datetime: {value}")
    return None


def to_order_create(raw: dict) -> OrderCreate | None:
    """Convert raw Paris order dict to canonical OrderCreate.

    TODO: Adjust field access paths once real API response schema is confirmed.
    """
    order = ParisOrder(**raw)

    if not order.order_id:
        logger.warning("[paris] Order missing order_id — skipping")
        return None

    # Resolve status — map to internal canonical statuses
    # TODO: Confirm exact status strings from Paris API
    _STATUS_MAP = {
        "pending": "pending",
        "ready_to_ship": "ready_to_ship",
        "shipped": "shipped",
        "delivered": "delivered",
        "canceled": "cancelled",
        "cancelled": "cancelled",
    }
    raw_status = (order.status or "").lower().strip()
    status = _STATUS_MAP.get(raw_status, raw_status)

    # Skip terminal statuses — same as Falabella Regular
    if status in ("delivered", "cancelled"):
        logger.info(f"[paris] Order {order.order_id} is {status} — skipping")
        return None

    # Resolve delivery deadline
    limit_delivery_date = parse_paris_datetime(order.promised_shipping_time)
    if not limit_delivery_date:
        logger.warning(f"[paris] Order {order.order_id} has no delivery deadline — skipping")
        return None

    # Extract product info from first item
    product_name = None
    product_quantity = None
    items = order.items or []
    if items:
        first = items[0] if isinstance(items[0], dict) else {}
        product_name = first.get("name") or first.get("Name")
        qty = first.get("quantity") or first.get("Quantity")
        if qty is not None:
            try:
                product_quantity = int(qty)
            except (ValueError, TypeError):
                pass

    return OrderCreate(
        external_id=str(order.order_id),
        source="paris",
        status=status,
        created_at_source=parse_paris_datetime(order.created_at),
        limit_delivery_date=limit_delivery_date,
        product_name=product_name,
        product_quantity=product_quantity,
        raw_data=raw,
    )
