"""Starken transit time lookup and delivery deadline calculation.

Uses the official Starken coverage & transit matrix (2026-01) to determine
how many calendar days a shipment takes from Santiago (RM) to each locality.

Deadline = order_date + preparation + max_transit_days

Preparation logic:
  - Orders are prepared the next business day after placement.
  - Business days: Mon–Sat, excluding Chilean public holidays.
  - Example: order Wed 13:02 → prepared Thu → transit starts Thu.
"""
import csv
import os
from datetime import date, datetime, timedelta
from unicodedata import normalize as _unicode_normalize
from zoneinfo import ZoneInfo

from integrations.shopify.holidays import is_holiday

_SANTIAGO_TZ = ZoneInfo("America/Santiago")
_CUTOFF_HOUR = 13  # same cutoff as Welivery orders

# Lazy-loaded transit dict: {normalized_locality: max_transit_days}
_starken_transit: dict[str, int] | None = None

# Default transit days for RM communes (not in the matrix because they're local)
_RM_DEFAULT_TRANSIT_DAYS = 1


def _normalize_name(name: str) -> str:
    """Normalize locality name: lowercase, strip accents, trim."""
    name = name.strip().lower()
    name = _unicode_normalize("NFD", name)
    name = "".join(c for c in name if not (0x0300 <= ord(c) <= 0x036F))
    return name


def _load_transit() -> dict[str, int]:
    """Load transit CSV into memory (once)."""
    global _starken_transit
    if _starken_transit is not None:
        return _starken_transit

    csv_path = os.path.join(os.path.dirname(__file__), "starken_transit.csv")
    transit: dict[str, int] = {}
    with open(csv_path, encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)  # skip header
        for row in reader:
            if len(row) < 4:
                continue
            locality = _normalize_name(row[0])
            max_days = int(row[3])
            transit[locality] = max_days
    _starken_transit = transit
    return transit


def _is_business_day(d: date) -> bool:
    """Mon–Sat, excluding Chilean holidays."""
    return d.weekday() <= 5 and not is_holiday(d)


def _next_business_day(d: date) -> date:
    """Return next business day strictly after d."""
    d = d + timedelta(days=1)
    while not _is_business_day(d):
        d = d + timedelta(days=1)
    return d


def _add_calendar_days_from_business_start(start: date, calendar_days: int) -> date:
    """Add calendar_days starting from a business day (the preparation/handoff day).

    The transit clock starts the day Starken picks up the package (the prep day).
    We add max_transit calendar days from that point.
    """
    return start + timedelta(days=calendar_days)


def get_transit_days(commune: str) -> int | None:
    """Look up max transit days for a commune/locality.

    Returns None if the locality is not found in the matrix.
    """
    transit = _load_transit()
    key = _normalize_name(commune)
    return transit.get(key)


def compute_starken_deadline(order_created: datetime, commune: str) -> datetime | None:
    """Compute delivery deadline for a Starken shipment.

    Args:
        order_created: Order creation datetime (timezone-aware).
        commune: Destination commune/locality name.

    Returns:
        Deadline datetime (23:59:59 Santiago) or None if commune not in matrix.

    Algorithm:
        1. Convert to Santiago timezone.
        2. Determine prep_date (next business day, considering cutoff).
        3. Look up max transit days for the commune.
        4. Deadline = prep_date + max_transit_days (calendar days).
    """
    dt = order_created.astimezone(_SANTIAGO_TZ)
    d = dt.date()

    # Determine preparation date: next business day from order
    if not _is_business_day(d):
        prep_date = _next_business_day(d)
    elif dt.hour < _CUTOFF_HOUR:
        prep_date = d
    else:
        prep_date = _next_business_day(d)

    # Look up transit days
    transit_days = get_transit_days(commune)
    if transit_days is None:
        return None

    # Deadline = prep_date + transit_days calendar days
    deadline_date = _add_calendar_days_from_business_start(prep_date, transit_days)

    return datetime(
        deadline_date.year, deadline_date.month, deadline_date.day,
        18, 0, 0,
        tzinfo=_SANTIAGO_TZ,
    )
