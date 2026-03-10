"""Tests for Falabella order mapper."""
import pytest
from integrations.falabella.mapper import to_order_create, parse_falabella_datetime


class TestHappyPath:
    def test_pending_order(self, falabella_raw):
        result = to_order_create(falabella_raw)
        assert result is not None
        assert result.external_id == "12345"
        assert result.source == "falabella"
        assert result.status == "pending"
        assert result.product_name == "Zapatilla Running"
        assert result.product_quantity == 2

    def test_shipped_regular(self, falabella_raw):
        falabella_raw["Statuses"] = [{"Status": "shipped"}]
        result = to_order_create(falabella_raw)
        assert result is not None
        assert result.status == "shipped"


class TestSkips:
    def test_fbf_skipped(self, falabella_raw):
        falabella_raw["ShippingType"] = "Fulfilled by Falabella"
        assert to_order_create(falabella_raw) is None

    def test_no_delivery_date_regular_skipped(self, falabella_raw):
        del falabella_raw["PromisedShippingTime"]
        assert to_order_create(falabella_raw) is None

    def test_regular_delivered_accepted(self, falabella_raw):
        """Regular+delivered orders are now accepted (archived on delivered)."""
        falabella_raw["Statuses"] = [{"Status": "delivered"}]
        result = to_order_create(falabella_raw)
        assert result is not None
        assert result.status == "delivered"


class TestDirectProvider:
    def test_direct_shipped_remapped_to_ready_to_ship(self, falabella_raw):
        falabella_raw["ShippingProviderType"] = "falaflex"
        falabella_raw["Statuses"] = [{"Status": "shipped"}]
        result = to_order_create(falabella_raw)
        assert result is not None
        assert result.status == "ready_to_ship"

    def test_direct_no_delivery_date_fallback_created_at(self, falabella_raw):
        falabella_raw["ShippingProviderType"] = "direct"
        del falabella_raw["PromisedShippingTime"]
        result = to_order_create(falabella_raw)
        assert result is not None
        assert result.limit_delivery_date.hour == 23
        assert result.limit_delivery_date.minute == 30

    def test_direct_delivered_not_skipped(self, falabella_raw):
        """Direct delivered orders are NOT skipped (need to track until delivered)."""
        falabella_raw["ShippingProviderType"] = "falaflex"
        falabella_raw["Statuses"] = [{"Status": "delivered"}]
        result = to_order_create(falabella_raw)
        assert result is not None
        assert result.status == "delivered"


class TestParseDatetime:
    @pytest.mark.parametrize("value,expected_year", [
        ("2026-03-09 10:00:00", 2026),
        ("2026-03-09T10:00:00-04:00", 2026),
        ("2026-03-09T10:00:00", 2026),
        ("2026-03-09", 2026),
    ])
    def test_valid_formats(self, value, expected_year):
        result = parse_falabella_datetime(value)
        assert result is not None
        assert result.year == expected_year

    def test_none_input(self):
        assert parse_falabella_datetime(None) is None

    def test_invalid_input(self):
        assert parse_falabella_datetime("not-a-date") is None
