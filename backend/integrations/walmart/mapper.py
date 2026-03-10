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


def _unwrap_order_lines(raw: dict) -> tuple[list[dict], list[WalmartOrderLine]]:
    """Parse and unwrap Walmart order lines from raw dict.

    Returns (raw_line_list, parsed_order_lines).
    """
    order_lines_raw = raw.get("orderLines") or {}
    line_list = order_lines_raw.get("orderLine") or []
    if isinstance(line_list, dict):
        line_list = [line_list]
    # Walmart Chile wraps nested arrays in an object:
    # {"charges": {"charge": [...]}, "orderLineStatuses": {"orderLineStatus": [...]}}
    for ln in line_list:
        if isinstance(ln.get("charges"), dict):
            ln["charges"] = ln["charges"].get("charge") or []
        if isinstance(ln.get("orderLineStatuses"), dict):
            ln["orderLineStatuses"] = ln["orderLineStatuses"].get("orderLineStatus") or []
    return line_list, [WalmartOrderLine(**ln) for ln in line_list]


def _get_line_tracking(line: dict) -> str:
    """Extract tracking number from a raw order line dict."""
    statuses = line.get("orderLineStatuses") or []
    for s in statuses:
        if isinstance(s, dict):
            ti = s.get("trackingInfo") or {}
            if isinstance(ti, dict) and ti.get("trackingNumber"):
                return str(ti["trackingNumber"])
    return ""


def to_order_create(raw: dict) -> OrderCreate | None:
    """Convert raw Walmart order dict to canonical OrderCreate.

    For multi-line orders with different tracking, returns only the first.
    """
    results = to_order_creates(raw)
    return results[0] if results else None


def to_order_creates(raw: dict) -> list[OrderCreate]:
    """Convert raw Walmart order dict to canonical OrderCreate(s).

    When an order has multiple orderLines with different tracking numbers,
    each line becomes a separate OrderCreate with external_id = '{poId}-{index}'.
    Single-line orders or lines with same tracking keep external_id = '{poId}'.
    """
    order = WalmartOrder(**raw)

    if not order.purchaseOrderId:
        logger.warning("Walmart order missing purchaseOrderId — skipping")
        return []

    line_list_raw, order_lines = _unwrap_order_lines(raw)

    # Resolve overall status
    status = _resolve_status(order_lines)

    # Skip terminal statuses
    if status in ("delivered", "cancelled"):
        logger.info(f"Walmart order {order.purchaseOrderId} is {status} — skipping")
        return []

    # Resolve delivery deadline
    shipping = order.shippingInfo
    limit_delivery_date = None
    if shipping:
        limit_delivery_date = _epoch_to_datetime(shipping.estimatedShipDate)

    if not limit_delivery_date:
        logger.warning(f"Walmart order {order.purchaseOrderId} has no estimatedShipDate — skipping")
        return []

    today = datetime.now(_SANTIAGO).date()
    deadline_date = limit_delivery_date.astimezone(_SANTIAGO).date() if limit_delivery_date.tzinfo else limit_delivery_date.date()
    if deadline_date < today:
        logger.debug(f"Walmart order {order.purchaseOrderId} skipped: deadline {deadline_date} already passed")
        return []

    created_at_source = _epoch_to_datetime(order.orderDate)

    # Check for multiple lines with different tracking numbers
    tracking_numbers = {_get_line_tracking(ln) for ln in line_list_raw}
    tracking_numbers.discard("")
    should_split = len(tracking_numbers) > 1 and len(line_list_raw) > 1

    if should_split:
        results = []
        for idx, (ln_raw, ol) in enumerate(zip(line_list_raw, order_lines)):
            # Per-line product info
            product_name = None
            product_quantity = None
            if ol.item:
                product_name = ol.item.productName or ol.item.sku
            if ol.orderLineQuantity and ol.orderLineQuantity.amount:
                try:
                    product_quantity = int(ol.orderLineQuantity.amount)
                except (ValueError, TypeError):
                    pass

            # Per-line status
            line_status = _resolve_status([ol])

            # Per-line raw_data
            line_raw = {**raw, "_line_index": idx}
            line_raw["orderLines"] = {"orderLine": [ln_raw]}

            results.append(OrderCreate(
                external_id=f"{order.purchaseOrderId}-{idx}",
                source="walmart",
                status=line_status,
                created_at_source=created_at_source,
                limit_delivery_date=limit_delivery_date,
                limit_handoff_date=limit_delivery_date,
                product_name=product_name,
                product_quantity=product_quantity,
                raw_data=line_raw,
            ))
        return results
    else:
        # Single line or same tracking — original behavior
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

        return [OrderCreate(
            external_id=str(order.purchaseOrderId),
            source="walmart",
            status=status,
            created_at_source=created_at_source,
            limit_delivery_date=limit_delivery_date,
            limit_handoff_date=limit_delivery_date,
            product_name=product_name,
            product_quantity=product_quantity,
            raw_data=raw,
        )]
