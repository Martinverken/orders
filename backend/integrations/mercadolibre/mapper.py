from models.order import OrderCreate
from integrations.mercadolibre.schemas import MLOrder, MLShipmentDetail
from utils.business_days import compute_handoff_deadline
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import logging
import os
import json
import math

_SANTIAGO = ZoneInfo("America/Santiago")

# Weekly CE cutoff schedule: {"monday": "11:00", "thursday": "14:45", ...}
# sell_cutoff[day] = ce_cutoff[day] - 6h (always 6h buffer)
# Set via ML_CE_CUTOFF_SCHEDULE env var (update each Friday for next week)
_WEEKDAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
# Loaded from DB at sync time (reload_ce_schedule); env var is the initial fallback
_ML_CE_SCHEDULE: dict[str, str] = json.loads(os.getenv("ML_CE_CUTOFF_SCHEDULE", "{}"))


def reload_ce_schedule(schedule: dict[str, str]) -> None:
    """Update the in-process CE schedule (called from sync service and settings router)."""
    global _ML_CE_SCHEDULE
    _ML_CE_SCHEDULE = schedule


def _end_of_day_santiago(dt: datetime) -> datetime:
    """Return same calendar date at 23:59:00 Santiago time."""
    local = dt.astimezone(_SANTIAGO)
    return local.replace(hour=23, minute=59, second=0, microsecond=0)


def _next_business_day_eod(dt: datetime) -> datetime:
    """End-of-day Santiago del siguiente día hábil (lun-vie) a partir de dt."""
    d = dt.astimezone(_SANTIAGO) + timedelta(days=1)
    while d.weekday() >= 5:  # 5=sábado, 6=domingo
        d += timedelta(days=1)
    return d.replace(hour=23, minute=59, second=0, microsecond=0)


def _resolve_ce_deadline_from_schedule(date_handling_dt: datetime) -> datetime | None:
    """Find CE dispatch deadline using the weekly cutoff schedule.

    Algorithm: find first day D (starting from date_handling date) where
    date_handling < sell_cutoff[D] (sell_cutoff = ce_cutoff - 6h).
    Returns ce_cutoff[D] as the deadline.

    Example: date_handling = Tue 14:48, Wed ce_cutoff = 11:00
      Wed sell_cutoff = 05:00. Tue 14:48 < Wed 05:00 → deadline = Wed 11:00
    """
    if not _ML_CE_SCHEDULE:
        return None
    for delta in range(7):
        candidate_date = date_handling_dt.astimezone(_SANTIAGO).date()
        from datetime import date as date_type
        candidate_date = candidate_date + timedelta(days=delta)
        weekday = _WEEKDAY_NAMES[candidate_date.weekday()]
        ce_cutoff_str = _ML_CE_SCHEDULE.get(candidate_date.isoformat()) or _ML_CE_SCHEDULE.get(weekday)
        if not ce_cutoff_str:
            continue
        h, m = map(int, ce_cutoff_str.split(":"))
        ce_cutoff_dt = datetime(
            candidate_date.year, candidate_date.month, candidate_date.day,
            h, m, tzinfo=_SANTIAGO,
        )
        sell_cutoff_dt = ce_cutoff_dt - timedelta(hours=6)
        if date_handling_dt < sell_cutoff_dt:
            return ce_cutoff_dt
    return None


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
        Uses the weekly CE cutoff schedule (ML_CE_CUTOFF_SCHEDULE env var).
        Algorithm: from date_handling, find first day where date_handling < sell_cutoff[day]
        (sell_cutoff = ce_cutoff - 6h). Returns ce_cutoff[day] as the "Despachar antes de" time.
        Falls back to pay_before then estimated_delivery_limit.date if schedule is absent.

    Last resort: top-level estimated_delivery_time.date / .to
        Present even after the deadline has passed.
    """
    if not shipment:
        return None

    is_flex = str(shipment.logistic_type or "").lower() == "self_service"

    opt = shipment.shipping_option if isinstance(shipment.shipping_option, dict) else None

    # CE: use weekly cutoff schedule to find the correct "Despachar antes de HH:mm"
    if not is_flex and shipment_raw:
        status_history = shipment_raw.get("status_history") or {}
        date_handling_str = status_history.get("date_handling")
        if date_handling_str:
            date_handling = parse_ml_datetime(date_handling_str)
            if date_handling:
                deadline = _resolve_ce_deadline_from_schedule(date_handling)
                if deadline:
                    return deadline

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
                    if not is_flex:
                        return dt
                    base = _end_of_day_santiago(dt)
                    # Excepción buyer_absent / buyer_rescheduled: el conductor visitó
                    # pero el cliente estaba ausente o reprogramó la entrega
                    # → extender límite al siguiente día hábil
                    _EXTEND_SUBSTATUSES = {"buyer_absent", "buyer_rescheduled"}
                    substatus = (shipment_raw or {}).get("substatus") or ""
                    substatus_history = (shipment_raw or {}).get("substatus_history") or []
                    if substatus in _EXTEND_SUBSTATUSES or any(
                        e.get("substatus") in _EXTEND_SUBSTATUSES for e in substatus_history
                    ):
                        return _next_business_day_eod(base)
                    return base

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

    shipment_status = (shipment.status if shipment else None) or order.status or "unknown"

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

    # Compute limit_handoff_date:
    # CE: handoff = limit_delivery_date (CE cutoff IS the handoff deadline)
    # Flex: cutoff 13:00 → handoff at 18:00 (same day or next business day)
    is_flex = logistic_type == "self_service"
    created_at_source = parse_ml_datetime(order.date_created)
    if is_flex and created_at_source:
        limit_handoff_date = compute_handoff_deadline(created_at_source)
    else:
        limit_handoff_date = limit_delivery_date

    return OrderCreate(
        external_id=str(order.id),
        source="mercadolibre",
        status=shipment_status,
        created_at_source=parse_ml_datetime(order.date_created),
        address_updated_at=parse_ml_datetime(order.date_last_updated),
        limit_delivery_date=limit_delivery_date,
        limit_handoff_date=limit_handoff_date,
        product_name=product_name,
        product_quantity=product_quantity,
        raw_data=raw_data,
    )
