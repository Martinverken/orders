"""Paris (Cencosud) order mapper.

Converts raw Paris API response into canonical OrderCreate.
Paris shipping logic is identical to Falabella Regular:
- Carrier (BLUEXPRESS) picks up from warehouse
- Deadline = dispatchDate (when seller must hand package to carrier)
- Bodega metric: first_shipped_at vs dispatchDate (handoff on time = success)
- Terminal state: delivered (carrier delivered to customer)

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
    """Convert raw Paris order dict to canonical OrderCreate.

    For multi-subOrder orders, returns only the first via to_order_creates().
    """
    results = to_order_creates(raw)
    return results[0] if results else None


def to_order_creates(raw: dict) -> list[OrderCreate]:
    """Convert raw Paris order dict to canonical OrderCreate(s).

    Each subOrder becomes a separate OrderCreate (each is a distinct shipment/bulto).
    Uses subOrderNumber as external_id per subOrder.
    """
    order = ParisOrder(**raw)

    if not order.id:
        logger.warning("[paris] Order missing id — skipping")
        return []

    sub_orders = order.subOrders or []
    if not sub_orders:
        logger.warning(f"[paris] Order {order.id} has no subOrders — skipping")
        return []

    created_at_source = parse_paris_datetime(order.createdAt or order.originOrderDate)
    today = datetime.now(_SANTIAGO).date()
    is_multi = len(sub_orders) > 1

    results = []
    for idx, sub in enumerate(sub_orders):
        if isinstance(sub, dict):
            sub = ParisSubOrder(**sub)

        # Resolve status from subOrder
        status = _resolve_status(sub)

        # Skip terminal statuses
        if status in ("delivered", "cancelled"):
            logger.info(f"[paris] Order {order.originOrderNumber} sub {sub.subOrderNumber} is {status} — skipping")
            continue

        # Resolve delivery deadline from dispatchDate
        limit_delivery_date = parse_paris_datetime(sub.dispatchDate)

        # If dispatchDate is a date-only (no time), set end of day Santiago
        if limit_delivery_date and limit_delivery_date.hour == 0 and limit_delivery_date.minute == 0:
            limit_delivery_date = limit_delivery_date.replace(hour=23, minute=59, second=0)

        if not limit_delivery_date:
            logger.warning(f"[paris] Order {order.originOrderNumber} sub {sub.subOrderNumber} has no dispatchDate — skipping")
            continue

        # Skip orders whose delivery deadline date has already passed
        deadline_date = limit_delivery_date.astimezone(_SANTIAGO).date() if limit_delivery_date.tzinfo else limit_delivery_date.date()
        if deadline_date < today:
            logger.debug(f"[paris] Order {order.originOrderNumber} sub {sub.subOrderNumber} skipped: deadline {deadline_date} already passed")
            continue

        # Extract product info from first item of this subOrder
        product_name = None
        product_quantity = None
        items = sub.items or []
        if items:
            first_item = items[0]
            if isinstance(first_item, dict):
                product_name = first_item.get("name")
            else:
                product_name = first_item.name
            product_quantity = 1

        # Use subOrderNumber as external_id (each subOrder is a distinct shipment)
        external_id = sub.subOrderNumber or (f"{order.id}-{idx}" if is_multi else str(order.id))

        # Per-subOrder raw_data
        sub_raw = {**raw, "_suborder_index": idx}

        results.append(OrderCreate(
            external_id=external_id,
            source="paris",
            status=status,
            created_at_source=created_at_source,
            limit_delivery_date=limit_delivery_date,
            limit_handoff_date=limit_delivery_date,  # Paris Regular: handoff = delivery deadline
            product_name=product_name,
            product_quantity=product_quantity,
            raw_data=sub_raw,
        ))

    return results
