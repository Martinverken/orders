"""Shopify → OrderCreate mapper.

Eligibility rules:
  - financial_status == "paid"
  - tags include "ebox"   (case-insensitive)
  - tags include "welivery" (case-insensitive)
  - Future: "SKN" tag will use Starken transit matrix (code ready, not active)

Delivery promise:
  Welivery orders (tag "welivery"):
    - Cutoff: 13:00 Santiago
    - Express (tag "express"): promise = base_date 23:59:59
    - Standard:                promise = base_date + 2 business days, 23:59:59

  Starken orders (tag "SKN"):
    - Cutoff: 13:00 Santiago
    - Prep: next business day
    - Transit: max days from Starken transit matrix (by destination commune)
    - Promise = prep_date + transit calendar days, 23:59:59
"""
import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from models.order import OrderCreate
from integrations.shopify.holidays import is_holiday
from shipping.transit import compute_starken_deadline
from utils.business_days import compute_handoff_deadline as _compute_handoff_deadline

logger = logging.getLogger(__name__)

_SANTIAGO_TZ = ZoneInfo("America/Santiago")
_CUTOFF_HOUR = 13


# ── Tag helpers ─────────────────────────────────────────────────────────────

def has_tag(tags: str, tag: str) -> bool:
    """Case-insensitive, trim-safe tag check."""
    needle = tag.strip().lower()
    return any(t.strip().lower() == needle for t in tags.split(","))


# ── Eligibility ──────────────────────────────────────────────────────────────

def check_eligibility(order: dict) -> dict:
    """Return {eligible: bool, reasons: list[str]}."""
    reasons: list[str] = []
    if order.get("financial_status") != "paid":
        reasons.append("not_paid")
    tags = order.get("tags") or ""
    if not has_tag(tags, "ebox"):
        reasons.append("missing_ebox")
    if not has_tag(tags, "welivery"):
        reasons.append("missing_welivery")
    return {"eligible": len(reasons) == 0, "reasons": reasons}


# ── Business day helpers ─────────────────────────────────────────────────────

def is_business_day(d: date) -> bool:
    """True if d is Mon–Sat and not a Chilean public holiday."""
    return d.weekday() <= 5 and not is_holiday(d)  # Mon=0, Sat=5, Sun=6


def next_business_day(d: date) -> date:
    """Return the next business day strictly after d."""
    d = d + timedelta(days=1)
    while not is_business_day(d):
        d = d + timedelta(days=1)
    return d


def add_business_days(d: date, n: int) -> date:
    """Advance d by exactly n business days."""
    for _ in range(n):
        d = next_business_day(d)
    return d


# ── Delivery promise ─────────────────────────────────────────────────────────

def _compute_base_date(order: dict) -> date:
    """Determine the base handoff date from cutoff rules.

    - Non-business day → next_business_day
    - Business day + before 13:00 → same day
    - Business day + 13:00 or later → next_business_day
    """
    created_raw = order.get("created_at") or ""
    dt = datetime.fromisoformat(created_raw).astimezone(_SANTIAGO_TZ)
    d = dt.date()

    if not is_business_day(d):
        return next_business_day(d)
    elif dt.hour < _CUTOFF_HOUR:
        return d
    else:
        return next_business_day(d)


def compute_delivery_promise(order: dict) -> datetime:
    """Compute the delivery promise datetime for a Shopify order.

    Express: base_date 23:59:59  |  Standard: base_date + 2 BD 23:59:59
    """
    base = _compute_base_date(order)

    tags = order.get("tags") or ""
    if has_tag(tags, "express"):
        promise_date = base
    else:
        promise_date = add_business_days(base, 2)

    return datetime(
        promise_date.year, promise_date.month, promise_date.day,
        18, 0, 0,
        tzinfo=_SANTIAGO_TZ,
    )


def compute_handoff_date(order: dict) -> datetime:
    """Compute warehouse handoff deadline: cutoff 13:00 → same/next BD at 18:00."""
    created_raw = order.get("created_at") or ""
    created_dt = datetime.fromisoformat(created_raw).astimezone(_SANTIAGO_TZ)
    return _compute_handoff_deadline(created_dt)


# ── Product info ─────────────────────────────────────────────────────────────

def _get_product_info(order: dict) -> tuple[str | None, int | None]:
    items = order.get("line_items") or []
    if items:
        first = items[0]
        name = first.get("title") or first.get("name")
        qty = first.get("quantity")
        try:
            qty = int(qty) if qty is not None else None
        except (ValueError, TypeError):
            qty = None
        return name, qty
    return None, None


# ── Main mapper ──────────────────────────────────────────────────────────────

def _get_commune(raw: dict) -> str | None:
    """Extract commune/city from shipping_address."""
    addr = raw.get("shipping_address") or {}
    return addr.get("city") or addr.get("province") or None


def to_order_create(raw: dict, source: str = "shopify") -> OrderCreate | None:
    """Convert raw Shopify order dict to canonical OrderCreate.

    For single-fulfillment or no-fulfillment orders returns one OrderCreate.
    For multi-fulfillment orders, returns only the first via to_order_creates().
    """
    results = to_order_creates(raw, source)
    return results[0] if results else None


def to_order_creates(raw: dict, source: str = "shopify") -> list[OrderCreate]:
    """Convert raw Shopify order dict to canonical OrderCreate(s).

    When an order has multiple fulfillments with different tracking numbers,
    each fulfillment becomes a separate OrderCreate with external_id = '{id}-{index}'.
    Single-fulfillment orders keep external_id = '{id}'.
    """
    eligibility = check_eligibility(raw)
    if not eligibility["eligible"]:
        logger.debug(
            f"Shopify order {raw.get('name')} not eligible: {eligibility['reasons']}"
        )
        return []

    tags = raw.get("tags") or ""
    is_skn = has_tag(tags, "SKN")

    try:
        if is_skn:
            limit_delivery_date = _compute_skn_promise(raw)
            limit_handoff_date = compute_handoff_date(raw)
        else:
            limit_delivery_date = compute_delivery_promise(raw)
            limit_handoff_date = compute_handoff_date(raw)
    except Exception as e:
        logger.warning(f"Shopify order {raw.get('name')}: cannot compute promise: {e}")
        return []

    if limit_delivery_date is None:
        logger.warning(f"Shopify order {raw.get('name')}: SKN commune not in transit matrix")
        return []

    created_raw = raw.get("created_at")
    try:
        created_at_source = datetime.fromisoformat(created_raw) if created_raw else None
    except ValueError:
        created_at_source = None

    # Map Shopify fulfillment_status to internal status
    fulfillment_status = raw.get("fulfillment_status")
    status = "shipped" if fulfillment_status == "fulfilled" else "pending"

    # Check for multiple fulfillments (bultos)
    fulfillments = raw.get("fulfillments") or []
    tracking_numbers = {
        (f.get("tracking_number") or "") for f in fulfillments if isinstance(f, dict)
    }
    tracking_numbers.discard("")
    should_split = len(tracking_numbers) > 1 and len(fulfillments) > 1

    if should_split:
        results = []
        for idx, ful in enumerate(fulfillments):
            if not isinstance(ful, dict):
                continue
            # Per-fulfillment product info
            ful_items = ful.get("line_items") or []
            if ful_items:
                first = ful_items[0]
                product_name = first.get("title") or first.get("name")
                qty = first.get("quantity")
                try:
                    product_quantity = int(qty) if qty is not None else None
                except (ValueError, TypeError):
                    product_quantity = None
            else:
                product_name, product_quantity = None, None

            # Per-fulfillment status
            ful_status = ful.get("status")
            if ful_status == "success":
                item_status = "shipped"
            elif status == "shipped":
                item_status = "shipped"
            else:
                item_status = "pending"

            # Per-fulfillment raw_data
            item_raw = {**raw, "fulfillments": [ful], "_fulfillment_index": idx}

            results.append(OrderCreate(
                external_id=f"{raw['id']}-{idx}",
                source=source,
                status=item_status,
                created_at_source=created_at_source,
                limit_delivery_date=limit_delivery_date,
                limit_handoff_date=limit_handoff_date,
                product_name=product_name,
                product_quantity=product_quantity,
                raw_data=item_raw,
            ))
        return results
    else:
        # Single fulfillment or no fulfillments — original behavior
        product_name, product_quantity = _get_product_info(raw)

        return [OrderCreate(
            external_id=str(raw["id"]),
            source=source,
            status=status,
            created_at_source=created_at_source,
            limit_delivery_date=limit_delivery_date,
            limit_handoff_date=limit_handoff_date,
            product_name=product_name,
            product_quantity=product_quantity,
            raw_data=raw,
        )]


def _compute_skn_promise(raw: dict) -> datetime | None:
    """Compute delivery promise for a Starken (SKN) order.

    Uses the Starken transit matrix to determine delivery deadline
    based on the destination commune from shipping_address.

    Returns None if commune is not found in the transit matrix.
    """
    created_raw = raw.get("created_at") or ""
    dt = datetime.fromisoformat(created_raw).astimezone(_SANTIAGO_TZ)

    commune = _get_commune(raw)
    if not commune:
        logger.warning(f"Shopify SKN order {raw.get('name')}: no shipping commune")
        return None

    return compute_starken_deadline(dt, commune)
