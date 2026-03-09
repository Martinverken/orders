"""Tests for Paris (Cencosud) order mapper."""
import pytest
from integrations.paris.mapper import to_order_create, parse_paris_datetime


class TestHappyPath:
    def test_pending_order(self, paris_raw):
        result = to_order_create(paris_raw)
        assert result is not None
        assert result.external_id == "PAR-001"
        assert result.source == "paris"
        assert result.status == "pending"
        assert result.product_name == "Cojín Decorativo"
        assert result.product_quantity == 1

    def test_date_only_gets_end_of_day(self, paris_raw):
        """dispatchDate '2026-03-12' should become 23:59 Santiago."""
        result = to_order_create(paris_raw)
        assert result is not None
        assert result.limit_delivery_date.hour == 23
        assert result.limit_delivery_date.minute == 59


class TestSkips:
    def test_delivered_skipped(self, paris_raw):
        paris_raw["subOrders"][0]["status"]["name"] = "delivered"
        assert to_order_create(paris_raw) is None

    def test_cancelled_skipped(self, paris_raw):
        paris_raw["subOrders"][0]["status"]["name"] = "cancelada"
        assert to_order_create(paris_raw) is None

    def test_no_suborders_skipped(self, paris_raw):
        paris_raw["subOrders"] = []
        assert to_order_create(paris_raw) is None

    def test_no_dispatch_date_skipped(self, paris_raw):
        paris_raw["subOrders"][0]["dispatchDate"] = None
        assert to_order_create(paris_raw) is None

    def test_no_id_skipped(self, paris_raw):
        paris_raw["id"] = None
        assert to_order_create(paris_raw) is None


class TestStatusMapping:
    @pytest.mark.parametrize("status_name,expected", [
        ("pending", "pending"),
        ("pendiente", "pending"),
        ("confirmada", "ready_to_ship"),
        ("despachada", "shipped"),
    ])
    def test_spanish_status_names(self, paris_raw, status_name, expected):
        paris_raw["subOrders"][0]["status"]["name"] = status_name
        result = to_order_create(paris_raw)
        assert result is not None
        assert result.status == expected


class TestParseDatetime:
    def test_date_only(self):
        result = parse_paris_datetime("2026-03-12")
        assert result is not None
        assert result.year == 2026
        assert result.month == 3
        assert result.day == 12

    def test_none_input(self):
        assert parse_paris_datetime(None) is None
