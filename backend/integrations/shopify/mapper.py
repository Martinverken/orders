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

def compute_delivery_promise(order: dict) -> datetime:
    """Compute the delivery promise datetime for a Shopify order.

    Algorithm:
      1. Convert created_at to America/Santiago.
      2. Determine base_date:
         - Non-business day → next_business_day
         - Business day + before 13:00 → same day
         - Business day + 13:00 or later → next_business_day
      3. promise_date:
         - Express: base_date
         - Standard: add_business_days(base_date, 2)
      4. Return promise_date at 23:59:59 Santiago.
    """
    created_raw = order.get("created_at") or ""
    dt = datetime.fromisoformat(created_raw).astimezone(_SANTIAGO_TZ)
    d = dt.date()

    if not is_business_day(d):
        base = next_business_day(d)
    elif dt.hour < _CUTOFF_HOUR:
        base = d
    else:
        base = next_business_day(d)

    tags = order.get("tags") or ""
    if has_tag(tags, "express"):
        promise_date = base
    else:
        promise_date = add_business_days(base, 2)

    return datetime(
        promise_date.year, promise_date.month, promise_date.day,
        23, 59, 59,
        tzinfo=_SANTIAGO_TZ,
    )


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

    Returns None if the order is not eligible.
    """
    eligibility = check_eligibility(raw)
    if not eligibility["eligible"]:
        logger.debug(
            f"Shopify order {raw.get('name')} not eligible: {eligibility['reasons']}"
        )
        return None

    tags = raw.get("tags") or ""
    is_skn = has_tag(tags, "SKN")

    try:
        if is_skn:
            limit_delivery_date = _compute_skn_promise(raw)
        else:
            limit_delivery_date = compute_delivery_promise(raw)
    except Exception as e:
        logger.warning(f"Shopify order {raw.get('name')}: cannot compute promise: {e}")
        return None

    if limit_delivery_date is None:
        logger.warning(f"Shopify order {raw.get('name')}: SKN commune not in transit matrix")
        return None

    # Don't skip past-deadline orders — they stay as OVERDUE until courier delivers.
    # The cleanup logic in sync_service handles archival only when status=delivered.

    product_name, product_quantity = _get_product_info(raw)

    created_raw = raw.get("created_at")
    try:
        created_at_source = datetime.fromisoformat(created_raw) if created_raw else None
    except ValueError:
        created_at_source = None

    # Map Shopify fulfillment_status to internal status:
    # - null/unfulfilled → pending (not yet prepared)
    # - fulfilled → shipped (handed to Welivery/Starken courier — our responsibility ends)
    fulfillment = raw.get("fulfillment_status")
    status = "shipped" if fulfillment == "fulfilled" else "pending"

    return OrderCreate(
        external_id=str(raw["id"]),
        source=source,
        status=status,
        created_at_source=created_at_source,
        limit_delivery_date=limit_delivery_date,
        product_name=product_name,
        product_quantity=product_quantity,
        raw_data=raw,
    )


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
