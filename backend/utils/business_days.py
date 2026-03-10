"""Shared business-day and warehouse cutoff helpers.

Used by Falabella, ML, and Shopify mappers to compute limit_handoff_date.
"""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from integrations.shopify.holidays import is_holiday

_SANTIAGO = ZoneInfo("America/Santiago")
_CUTOFF_HOUR = 13
_WAREHOUSE_CLOSE_HOUR = 18


def is_business_day(d: date) -> bool:
    """True if d is Mon–Sat and not a Chilean public holiday."""
    return d.weekday() <= 5 and not is_holiday(d)


def next_business_day(d: date) -> date:
    """Return the next business day strictly after d."""
    d = d + timedelta(days=1)
    while not is_business_day(d):
        d = d + timedelta(days=1)
    return d


def compute_handoff_deadline(created_at: datetime) -> datetime:
    """Compute warehouse handoff deadline from order creation time.

    Rules (cutoff = 13:00 Santiago, close = 18:00 Santiago):
      - Created on non-business day       → next business day at 18:00
      - Created on business day < 13:00   → same day at 18:00
      - Created on business day >= 13:00  → next business day at 18:00
    """
    local = created_at.astimezone(_SANTIAGO)
    d = local.date()

    if not is_business_day(d):
        base = next_business_day(d)
    elif local.hour < _CUTOFF_HOUR:
        base = d
    else:
        base = next_business_day(d)

    return datetime(
        base.year, base.month, base.day,
        _WAREHOUSE_CLOSE_HOUR, 0, 0,
        tzinfo=_SANTIAGO,
    )
