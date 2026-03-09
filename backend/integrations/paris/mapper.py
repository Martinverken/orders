"""Paris (Cencosud) order mapper.

Converts raw Paris API response into canonical OrderCreate.
Paris shipping logic is identical to Falabella Regular:
- Carrier (BLUEXPRESS) picks up from warehouse
- Deadline = dispatchDate (when seller must hand package to carrier)
- Terminal state: shipped (carrier took it)

Status IDs (confirmed from real data):
  2  = cancelled
  4  = delivered
  14 = shipped
  18 = deleted
  22 = returned_to_seller
  (1, 3, etc. = pending/ready_to_ship — not yet seen in prod data)

Docs: https://developers.ecomm.cencosud.com/docs
"""

from datetime import datetime
from zoneinfo import ZoneInfo
import logging

from models.order import OrderCreate
from integrations.paris.schemas import ParisOrder, ParisSubOrder

logger = logging.getLogger(__name__)

_SANTIAGO = ZoneInfo("America/Santiago")

# Map statusId → canonical status
_STATUS_ID_MAP = {
    1: "pending",
    2: "cancelled",
    3: "ready_to_ship",
    4: "delivered",
    5: "ready_to_ship",
    14: "shipped",
    18: "cancelled",
    22: "cancelled",
}

# Fallback: map status.name → canonical status
_STATUS_NAME_MAP = {
    "pending": "pending",
    "pendiente": "pending",
    "created": "pending",
    "creada": "pending",
    "confirmed": "ready_to_ship",
    "confirmada": "ready_to_ship",
    "ready_to_ship": "ready_to_ship",
    "ready to ship": "ready_to_ship",
    "listo para despacho": "ready_to_ship",
    "por despachar": "ready_to_ship",
    "shipped": "shipped",
    "despachada": "shipped",
    "en camino": "shipped",
    "in_transit": "shipped",
    "delivered": "delivered",
    "entregada": "delivered",
    "canceled": "cancelled",
    "cancelled": "cancelled",
    "cancelada": "cancelled",
    "deleted": "cancelled",
    "returned_to_seller": "cancelled",
}


def parse_paris_datetime(value: str | None) -> datetime | None:
    """Parse datetime string from Paris API.

    Paris uses ISO dates: "2026-02-24" or "2026-02-24T17:30:46.000Z".
    """
    if not value:
        return None
    formats = [
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f",
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


def _resolve_status(sub_order: ParisSubOrder) -> str:
    """Map Paris subOrder status to canonical status."""
    # Prefer statusId (numeric, reliable)
    if sub_order.statusId is not None:
        mapped = _STATUS_ID_MAP.get(sub_order.statusId)
        if mapped:
            return mapped

    # Fallback to status.name
    status_name = ""
    if sub_order.status and sub_order.status.name:
        status_name = sub_order.status.name.lower().strip()

    return _STATUS_NAME_MAP.get(status_name, status_name or "unknown")


def to_order_create(raw: dict) -> OrderCreate | None:
    """Convert raw Paris order dict to canonical OrderCreate."""
    order = ParisOrder(**raw)

    if not order.id:
        logger.warning("[paris] Order missing id — skipping")
        return None

    # Get first subOrder (primary shipment)
    sub_orders = order.subOrders or []
    if not sub_orders:
        logger.warning(f"[paris] Order {order.id} has no subOrders — skipping")
        return None

    sub = sub_orders[0]
    if isinstance(sub, dict):
        sub = ParisSubOrder(**sub)

    # Resolve status from subOrder
    status = _resolve_status(sub)

    # Skip terminal statuses
    if status in ("delivered", "cancelled"):
        logger.info(f"[paris] Order {order.originOrderNumber} is {status} — skipping")
        return None

    # Resolve delivery deadline from dispatchDate
    # dispatchDate = when seller must hand package to carrier (same as Falabella Regular)
    limit_delivery_date = parse_paris_datetime(sub.dispatchDate)

    # If dispatchDate is a date-only (no time), set end of day Santiago
    if limit_delivery_date and limit_delivery_date.hour == 0 and limit_delivery_date.minute == 0:
        limit_delivery_date = limit_delivery_date.replace(hour=23, minute=59, second=0)

    if not limit_delivery_date:
        logger.warning(f"[paris] Order {order.originOrderNumber} has no dispatchDate — skipping")
        return None

    # Skip orders whose delivery deadline date has already passed (compare dates, not datetimes)
    today = datetime.now(_SANTIAGO).date()
    deadline_date = limit_delivery_date.astimezone(_SANTIAGO).date() if limit_delivery_date.tzinfo else limit_delivery_date.date()
    if deadline_date < today:
        logger.debug(f"[paris] Order {order.originOrderNumber} skipped: deadline {deadline_date} already passed")
        return None

    # Extract product info from first item of first subOrder
    product_name = None
    product_quantity = None
    items = sub.items or []
    if items:
        first_item = items[0]
        if isinstance(first_item, dict):
            product_name = first_item.get("name")
        else:
            product_name = first_item.name
        # Paris doesn't have quantity per item in subOrder; default to 1
        product_quantity = 1

    # Use subOrderNumber as external_id (Paris always works with sub-orders, 10 digits)
    external_id = sub.subOrderNumber or str(order.id)

    return OrderCreate(
        external_id=external_id,
        source="paris",
        status=status,
        created_at_source=parse_paris_datetime(order.createdAt or order.originOrderDate),
        limit_delivery_date=limit_delivery_date,
        product_name=product_name,
        product_quantity=product_quantity,
        raw_data=raw,
    )
