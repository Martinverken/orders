from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import logging

from models.order import OrderCreate
from integrations.walmart.schemas import WalmartOrder, WalmartOrderLine

logger = logging.getLogger(__name__)

_SANTIAGO = ZoneInfo("America/Santiago")

# Walmart statuses that mean the order is still actionable for us
_ACTIONABLE_STATUSES = {"Created", "Acknowledged"}


def _epoch_to_datetime(epoch_ms: int | None) -> datetime | None:
    """Convert Walmart epoch millis to timezone-aware datetime."""
    if not epoch_ms:
        return None
    try:
        return datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc)
    except (OSError, ValueError):
        return None


def _resolve_status(order_lines: list[WalmartOrderLine]) -> str:
    """Derive a single canonical status from order line statuses.

    Walmart exposes status per order line. We take the "least advanced" status
    across all lines (Created < Acknowledged < Shipped < Delivered).

    Maps to our internal statuses:
    - Created     → pending
    - Acknowledged → ready_to_ship
    - Shipped     → shipped
    - Delivered   → delivered
    - Canceled    → cancelled
    """
    _STATUS_MAP = {
        "created": "pending",
        "acknowledged": "ready_to_ship",
        "shipped": "shipped",
        "delivered": "delivered",
        "canceled": "cancelled",
    }
    _PRIORITY = {"pending": 0, "ready_to_ship": 1, "shipped": 2, "delivered": 3, "cancelled": 4}

    statuses: list[str] = []
    for line in order_lines:
        for ls in (line.orderLineStatuses or []):
            raw = (ls.status or "").lower()
            mapped = _STATUS_MAP.get(raw, raw)
            statuses.append(mapped)

    if not statuses:
        return "unknown"

    # Return least advanced status (lowest priority)
    return min(statuses, key=lambda s: _PRIORITY.get(s, 99))


def to_order_create(raw: dict) -> OrderCreate | None:
    """Convert raw Walmart order dict to canonical OrderCreate."""
    order = WalmartOrder(**raw)

    if not order.purchaseOrderId:
        logger.warning("Walmart order missing purchaseOrderId — skipping")
        return None

    # Parse order lines
    order_lines_raw = raw.get("orderLines") or {}
    line_list = order_lines_raw.get("orderLine") or []
    if isinstance(line_list, dict):
        line_list = [line_list]
    # Walmart Chile wraps nested arrays in an object:
    # {"charges": {"charge": [...]}, "orderLineStatuses": {"orderLineStatus": [...]}}
    # Unwrap before parsing so Pydantic gets plain lists.
    for ln in line_list:
        if isinstance(ln.get("charges"), dict):
            ln["charges"] = ln["charges"].get("charge") or []
        if isinstance(ln.get("orderLineStatuses"), dict):
            ln["orderLineStatuses"] = ln["orderLineStatuses"].get("orderLineStatus") or []
    order_lines = [WalmartOrderLine(**ln) for ln in line_list]

    # Resolve status
    status = _resolve_status(order_lines)

    # Skip terminal statuses — these are already handled
    if status in ("delivered", "cancelled"):
        logger.info(f"Walmart order {order.purchaseOrderId} is {status} — skipping")
        return None

    # Resolve delivery deadline from shippingInfo.estimatedShipDate
    # Walmart Standard works like Falabella Regular: our deadline is when
    # we hand the package to the carrier (estimatedShipDate), not when
    # the customer receives it (estimatedDeliveryDate).
    shipping = order.shippingInfo
    limit_delivery_date = None
    if shipping:
        limit_delivery_date = _epoch_to_datetime(shipping.estimatedShipDate)

    if not limit_delivery_date:
        logger.warning(
            f"Walmart order {order.purchaseOrderId} has no estimatedShipDate — skipping"
        )
        return None

    # Skip orders whose delivery deadline date has already passed (compare dates, not datetimes)
    today = datetime.now(_SANTIAGO).date()
    deadline_date = limit_delivery_date.astimezone(_SANTIAGO).date() if limit_delivery_date.tzinfo else limit_delivery_date.date()
    if deadline_date < today:
        logger.debug(f"Walmart order {order.purchaseOrderId} skipped: deadline {deadline_date} already passed")
        return None

    # Extract product info from first order line
    product_name = None
    product_quantity = None
    if order_lines:
        first = order_lines[0]
        if first.item:
            product_name = first.item.productName or first.item.sku
        qty = first.orderLineQuantity
        if qty and qty.amount:
            try:
                product_quantity = int(qty.amount)
            except (ValueError, TypeError):
                pass

    return OrderCreate(
        external_id=str(order.purchaseOrderId),
        source="walmart",
        status=status,
        created_at_source=_epoch_to_datetime(order.orderDate),
        limit_delivery_date=limit_delivery_date,
        limit_handoff_date=limit_delivery_date,  # Walmart Standard: handoff = delivery deadline
        product_name=product_name,
        product_quantity=product_quantity,
        raw_data=raw,
    )
