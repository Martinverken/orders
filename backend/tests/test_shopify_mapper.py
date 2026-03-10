"""Tests for Shopify order mapper."""
import pytest
from datetime import date, datetime
from zoneinfo import ZoneInfo
from integrations.shopify.mapper import (
    to_order_create,
    has_tag,
    check_eligibility,
    is_business_day,
    compute_delivery_promise,
)
from shipping.transit import compute_starken_deadline, get_transit_days


class TestEligibility:
    def test_eligible(self, shopify_raw):
        result = check_eligibility(shopify_raw)
        assert result["eligible"] is True

    def test_not_paid(self, shopify_raw):
        shopify_raw["financial_status"] = "pending"
        result = check_eligibility(shopify_raw)
        assert result["eligible"] is False
        assert "not_paid" in result["reasons"]

    def test_missing_ebox(self, shopify_raw):
        shopify_raw["tags"] = "welivery"
        result = check_eligibility(shopify_raw)
        assert result["eligible"] is False
        assert "missing_ebox" in result["reasons"]

    def test_missing_welivery(self, shopify_raw):
        shopify_raw["tags"] = "ebox"
        result = check_eligibility(shopify_raw)
        assert result["eligible"] is False
        assert "missing_welivery" in result["reasons"]

    def test_skn_tag_not_eligible_yet(self, shopify_raw):
        """SKN tag alone is not enough — welivery required for now."""
        shopify_raw["tags"] = "ebox, SKN"
        result = check_eligibility(shopify_raw)
        assert result["eligible"] is False


class TestHasTag:
    def test_case_insensitive(self):
        assert has_tag("EBOX, Welivery", "ebox") is True
        assert has_tag("EBOX, Welivery", "welivery") is True

    def test_with_spaces(self):
        assert has_tag("  ebox , welivery  ", "ebox") is True

    def test_missing(self):
        assert has_tag("ebox", "welivery") is False


class TestMapper:
    def test_unfulfilled_maps_to_pending(self, shopify_raw):
        result = to_order_create(shopify_raw)
        assert result is not None
        assert result.external_id == "7001"
        assert result.status == "pending"
        assert result.product_name == "Pack Vitaminas"
        assert result.product_quantity == 3

    def test_fulfilled_maps_to_shipped(self, shopify_raw):
        """fulfilled = handed to courier (Welivery/Starken), terminal state."""
        shopify_raw["fulfillment_status"] = "fulfilled"
        result = to_order_create(shopify_raw)
        assert result is not None
        assert result.status == "shipped"

    def test_not_eligible_returns_none(self, shopify_raw):
        shopify_raw["financial_status"] = "pending"
        assert to_order_create(shopify_raw) is None

    def test_custom_source(self, shopify_raw):
        result = to_order_create(shopify_raw, source="shopify_kaut")
        assert result is not None
        assert result.source == "shopify_kaut"


class TestDeliveryPromise:
    def test_weekday_before_cutoff_standard(self, shopify_raw):
        """Tue 10am → base=Tue, +2 bdays = Thu, promise at 18:00."""
        promise = compute_delivery_promise(shopify_raw)
        assert promise.hour == 18
        assert promise.minute == 0
        # Tue Mar 10 + 2 bdays = Thu Mar 12
        assert promise.day == 12

    def test_weekday_after_cutoff(self, shopify_raw):
        """Tue 14:00 → base=Wed, +2 bdays = Fri."""
        shopify_raw["created_at"] = "2026-03-10T14:00:00-04:00"
        promise = compute_delivery_promise(shopify_raw)
        # base=Wed Mar 11, +2 bdays = Fri Mar 13
        assert promise.day == 13

    def test_express_same_base(self, shopify_raw):
        """Express: promise = base_date (no +2 bdays)."""
        shopify_raw["tags"] = "ebox, welivery, express"
        shopify_raw["created_at"] = "2026-03-10T10:00:00-04:00"  # Tue before cutoff
        promise = compute_delivery_promise(shopify_raw)
        # Express: base=Tue Mar 10 itself
        assert promise.day == 10

    def test_sunday_next_business_day(self, shopify_raw):
        """Sun Mar 8 → base=Mon Mar 9, +2 bdays = Wed Mar 11."""
        shopify_raw["created_at"] = "2026-03-08T10:00:00-04:00"  # Sunday
        promise = compute_delivery_promise(shopify_raw)
        # base=Mon Mar 9, +2 = Wed Mar 11
        assert promise.day == 11


class TestBusinessDay:
    def test_weekday_is_business(self):
        assert is_business_day(date(2026, 3, 10)) is True  # Tuesday

    def test_sunday_is_not_business(self):
        assert is_business_day(date(2026, 3, 8)) is False  # Sunday

    def test_holiday_is_not_business(self):
        assert is_business_day(date(2026, 1, 1)) is False  # Año Nuevo


# ── Starken transit tests ─────────────────────────────────────────────────────

_STG = ZoneInfo("America/Santiago")


class TestStarkenTransit:
    def test_known_locality(self):
        days = get_transit_days("ANTOFAGASTA")
        assert days is not None
        assert days == 2

    def test_accent_normalization(self):
        days = get_transit_days("Valparaíso")
        assert days is not None

    def test_unknown_locality_returns_none(self):
        assert get_transit_days("Mordor") is None

    def test_deadline_weekday_before_cutoff(self):
        """Tue 10am → prep=Tue, +2 transit = Thu."""
        dt = datetime(2026, 3, 10, 10, 0, 0, tzinfo=_STG)
        deadline = compute_starken_deadline(dt, "ANTOFAGASTA")  # 2 days transit
        assert deadline is not None
        # prep=Tue Mar 10 (before cutoff), +2 cal days = Mar 12
        assert deadline.day == 12
        assert deadline.hour == 18

    def test_deadline_weekday_after_cutoff(self):
        """Tue 14:00 → prep=Wed, +2 transit = Fri."""
        dt = datetime(2026, 3, 10, 14, 0, 0, tzinfo=_STG)
        deadline = compute_starken_deadline(dt, "ANTOFAGASTA")  # 2 days transit
        # prep=Wed Mar 11 (next bday), +2 cal days = Mar 13
        assert deadline is not None
        assert deadline.day == 13

    def test_deadline_sunday(self):
        """Sun → prep=Mon, +2 transit = Wed."""
        dt = datetime(2026, 3, 8, 10, 0, 0, tzinfo=_STG)
        deadline = compute_starken_deadline(dt, "ANTOFAGASTA")  # 2 days transit
        # prep=Mon Mar 9 (next bday), +2 cal days = Mar 11
        assert deadline is not None
        assert deadline.day == 11

    def test_deadline_unknown_commune(self):
        dt = datetime(2026, 3, 10, 10, 0, 0, tzinfo=_STG)
        assert compute_starken_deadline(dt, "Mordor") is None


class TestSKNMapper:
    """Test SKN-tagged Shopify orders — not active yet, code ready for future."""

    def test_skn_only_not_eligible(self):
        """SKN without welivery tag is not eligible (SKN not activated yet)."""
        raw = {
            "id": 8001,
            "name": "#2001",
            "financial_status": "paid",
            "tags": "ebox, SKN",
            "created_at": "2026-03-10T10:00:00-04:00",
            "line_items": [{"title": "Mesa Escritorio", "quantity": 1}],
            "shipping_address": {"city": "ANTOFAGASTA"},
        }
        assert to_order_create(raw) is None
