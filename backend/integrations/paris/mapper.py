"""Paris (Cencosud) order mapper.

Converts raw Paris API response into canonical OrderCreate.
Paris shipping logic is identical to Falabella Regular:
- Carrier picks up from warehouse
- Deadline = dispatchDate (when seller must hand package to carrier)
- Terminal state: shipped (carrier took it)

Docs: https://developers.ecomm.cencosud.com/docs
"""

from datetime import datetime
from zoneinfo import ZoneInfo
import logging

from models.order import OrderCreate
from integrations.paris.schemas import ParisOrder, ParisSubOrder

logger = logging.getLogger(__name__)

_SANTIAGO = ZoneInfo("America/Santiago")


def parse_paris_datetime(value: str | None) -> datetime | None:
    """Parse datetime string from Paris API.

    Paris uses ISO dates: "2019-08-24" or "2019-08-24T10:00:00".
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


def _resolve_status(sub_order: ParisSubOrder) -> str:
    """Map Paris subOrder status to canonical status.

    Paris uses statusId + status.name. Common patterns:
    - statusId values and their meaning need confirmation from real data.
    - We use status.name as fallback with reasonable mapping.
    """
    status_name = ""
    if sub_order.status and sub_order.status.name:
        status_name = sub_order.status.name.lower().strip()

    # Map known status names to canonical statuses
    # TODO: Confirm exact status names from Paris once real orders flow in
    _STATUS_MAP = {
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
    }

    return _STATUS_MAP.get(status_name, status_name or "unknown")


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
        logger.info(f"[paris] Order {order.id} is {status} — skipping")
        return None

    # Resolve delivery deadline from dispatchDate
    # dispatchDate = when seller must hand package to carrier (same as Falabella Regular)
    limit_delivery_date = parse_paris_datetime(sub.dispatchDate)

    # If dispatchDate is a date-only (no time), set end of day Santiago
    if limit_delivery_date and limit_delivery_date.hour == 0 and limit_delivery_date.minute == 0:
        limit_delivery_date = limit_delivery_date.replace(hour=23, minute=59, second=0)

    if not limit_delivery_date:
        logger.warning(f"[paris] Order {order.id} has no dispatchDate — skipping")
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

    return OrderCreate(
        external_id=str(order.id),
        source="paris",
        status=status,
        created_at_source=parse_paris_datetime(order.createdAt or order.originOrderDate),
        limit_delivery_date=limit_delivery_date,
        product_name=product_name,
        product_quantity=product_quantity,
        raw_data=raw,
    )
